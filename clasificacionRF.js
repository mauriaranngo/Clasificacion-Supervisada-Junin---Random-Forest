
// ---------- CONFIG ----------
var classNames = ee.List([
  "Mani","Alfalfa","Campo Nat","Maiz","Maiz 2da",
  "Soja 1era","Soja 2da","Sorgo","Urbano","Agua"
]);

// ------------- ASSETS ---------------- Reemplazar por los propios
var seed = 1234;
var assetPuntos = 'projects/practica-unahur/assets/Buffer_40m_Cultivos_Junin_2024-2025_geo';
var assetPoligono = 'projects/practica-unahur/assets/Junin'; // si tu AOI es otro, reemplazar

// ---------- cargar archivos ----------
var muestras_raw = ee.FeatureCollection(assetPuntos);
var zonaEstudio = ee.FeatureCollection(assetPoligono);

Map.centerObject(zonaEstudio, 9);
Map.addLayer(zonaEstudio.style({color:'000000', fillColor:'00000000'}), {}, 'Zona estudio');

// ---------- SENTINEL-2 (composición) ----------
var start = '2025-01-01';
var end = '2025-01-31';

var coleccion = ee.ImageCollection("COPERNICUS/S2_SR")
  .filterBounds(zonaEstudio)
  .filterDate(start, end)
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
  .select(["B2","B3","B4","B8","B11","B12"]);

var imageBase = coleccion.median().clip(zonaEstudio);

// ---------- INDICES ----------
function addIndices(img){
  var ndvi = img.normalizedDifference(['B8','B4']).rename('NDVI');
  var evi = img.expression(
    '2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))', {
      'NIR': img.select('B8'),
      'RED': img.select('B4'),
      'BLUE': img.select('B2')
    }).rename('EVI');
  var gndvi = img.normalizedDifference(['B8','B3']).rename('GNDVI');
  var ndwi = img.normalizedDifference(['B3','B11']).rename('NDWI');
  var savi = img.expression('((NIR - RED) / (NIR + RED + 0.5)) * 1.5', {
    'NIR': img.select('B8'), 'RED': img.select('B4')
  }).rename('SAVI');
  var nbr = img.normalizedDifference(['B8','B12']).rename('NBR');
  return img.addBands([ndvi,evi,gndvi,ndwi,savi,nbr]);
}

var image = addIndices(imageBase);
var bands = image.bandNames();


// ---------- MAPA DE COLORES ----------
var palette = ['#f1c40f','#27ae60','#e67e22','#f39c12','#1abc9c','#9b59b6','#2ecc71','#d35400','#7f8c8d','#3498db'];

// ---------- MUESTRAS: convertir Cultivo -> índice numérico ----------
var mapDict = ee.Dictionary({
  'Mani': 0, 'Alfalfa': 1, 'Campo Nat': 2, 'Maiz': 3, 'Maiz 2da': 4,
  'Soja 1era': 5, 'Soja 2da': 6, 'Sorgo': 7, 'Urbano': 8, 'Agua': 9
});

// Extraer valores en puntos (sampleRegions) usando la imagen con índices
var samplesAll = image.sampleRegions({
  collection: muestras_raw,
  properties: ['Cultivo'],
  scale: 10,
  tileScale: 4
});

// Mapear string -> número y filtrar no mapeos
var samplesMapped = samplesAll.map(function(f){
  var cultivo = ee.String(f.get('Cultivo'));
  var claseNum = ee.Number(mapDict.get(cultivo, -1));
  return f.set('clase', claseNum);
}).filter(ee.Filter.gte('clase', 0));



// ---------- SPLIT 80/20 sobre las muestras ----------
var samplesSplit = samplesMapped.randomColumn('random', seed);
var trainSamples = samplesSplit.filter(ee.Filter.lte('random', 0.8));
var validSamples = samplesSplit.filter(ee.Filter.gt('random', 0.8));


// ---------- ENTRENAMIENTO Random Forest ----------
var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 50,
  seed: seed
}).train({
  features: trainSamples,
  classProperty: 'clase',
  inputProperties: bands
});

print('Classifier trained.');

// ---------- IMPORTANCIA DE VARIABLES (opcional) ----------
var rfExplain = classifier.explain();


// ---------- CLASIFICAR IMAGEN ----------
var clasificacion = image.classify(classifier);
Map.addLayer(clasificacion, {min:0, max:9, palette: palette}, 'Clasificación Mejorada');

// ---------- VALIDACIÓN: matriz real con validSamples ----------
var validClassified = validSamples.classify(classifier);
var cm = validClassified.errorMatrix('clase', 'classification');
print('Matriz de Confusión (VALID 20%):', cm);
print('Accuracy VALID:', cm.accuracy());
print('Kappa VALID:', cm.kappa());

// ---------- EXPORTAR MATRIZ CON NOMBRES ----------
var cmArray = cm.array();           // ee.Array  (NxN)
var n = cmArray.length().get([0]);  // numero de clases (server-side)

// Convertir cada fila a Feature con nombres
var matrizFC = ee.FeatureCollection(
  ee.List.sequence(0, n.subtract(1)).map(function(i){
    i = ee.Number(i);
    var row = cmArray.slice(0, i, i.add(1)).project([1]).toList();
    var dict = ee.Dictionary.fromLists(classNames, row);
    dict = dict.set('Clase_real', classNames.get(i));
    return ee.Feature(null, dict);
  })
);

print('Matriz con nombres (server-side):', matrizFC);

// Exportar matriz
/*Export.table.toDrive({
  collection: matrizFC,
  description: 'matriz_confusion_validacion_nombres_Junin',
  fileFormat: 'CSV'
});*/

// ---------- METRICAS POR CLASE (TP, FP, FN, precision, recall, f1) ----------
var metricsFC = ee.FeatureCollection(
  ee.List.sequence(0, n.subtract(1)).map(function(i){
    i = ee.Number(i);
    var TP = cmArray.get([i, i]);
    // FP: suma columna i - TP
    var col = cmArray.slice(0, i, i.add(1)).project([1]);
    var FP = ee.Number(ee.Array(col).reduce(ee.Reducer.sum(), [0]).get([0])).subtract(TP);
    // FN: suma fila i - TP
    var row = cmArray.slice(1, i, i.add(1)).project([0]);
    var FN = ee.Number(ee.Array(row).reduce(ee.Reducer.sum(), [0]).get([0])).subtract(TP);

    var precision = ee.Algorithms.If(ee.Number(TP).add(FP).eq(0), 0, ee.Number(TP).divide(ee.Number(TP).add(FP)));
    var recall = ee.Algorithms.If(ee.Number(TP).add(FN).eq(0), 0, ee.Number(TP).divide(ee.Number(TP).add(FN)));
    var precisionN = ee.Number(precision);
    var recallN = ee.Number(recall);
    var f1 = ee.Algorithms.If(precisionN.add(recallN).eq(0), 0, precisionN.multiply(recallN).multiply(2).divide(precisionN.add(recallN)));

    return ee.Feature(null, {
      clase_num: i,
      clase_nombre: classNames.get(i),
      TP: TP,
      FP: FP,
      FN: FN,
      precision: precisionN,
      recall: recallN,
      f1_score: ee.Number(f1)
    });
  })
);

print('Métricas por clase (server-side):', metricsFC);

// Exportar métricas
/*Export.table.toDrive({
  collection: metricsFC,
  description: 'metricas_precision_recall_f1_Junin',
  fileFormat: 'CSV'
});*/

// ---------- HEATMAP VISUAL EN PANEL UI ----------
var panel = ui.Panel({
  style: {position: 'bottom-left', width: '520px', padding: '8px', maxHeight: '480px'}
});
ui.root.insert(0, panel);
panel.add(ui.Label({
  value: 'Matriz de Confusión (Heatmap) - Validación 20%',
  style: {fontWeight: 'bold', fontSize: '16px', margin: '6px 0 6px 0'}
}));

// Obtener PRIMERO los nombres de clases
classNames.evaluate(function(namesJS){
  // LUEGO obtener la matriz
  cmArray.evaluate(function(matrix){
    if (!matrix || !namesJS) {
      panel.add(ui.Label('No se pudo obtener la matriz en el cliente.'));
      return;
    }
    
    // Header
    var header = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
    header.add(ui.Label('Real \\ Pred', {margin: '4px', width: '160px', fontWeight: 'bold'}));
    
    namesJS.forEach(function(n){
      header.add(ui.Label(n, {margin: '4px', width: '50px', fontWeight: 'bold', fontSize: '11px'}));
    });
    panel.add(header);
    
    // Calcular valor máximo para normalización de color
    var maxVal = 0;
    for (var i = 0; i < matrix.length; i++) {
      for (var j = 0; j < matrix[i].length; j++) {
        if (matrix[i][j] > maxVal) maxVal = matrix[i][j];
      }
    }
    if (maxVal === 0) maxVal = 1;
    
    // Crear filas
    for (var r = 0; r < matrix.length; r++) {
      var rowPanel = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
      rowPanel.add(ui.Label(namesJS[r], {margin: '4px', width: '160px', fontWeight: 'bold'}));
      
      for (var c = 0; c < matrix[r].length; c++) {
        var value = matrix[r][c];
        // Redondear alpha a 2 decimales
        var alpha = 0.05 + 0.95 * (value / maxVal);
        alpha = Math.round(alpha * 100) / 100;
        
        var color = 'rgba(220,20,60,' + alpha.toFixed(2) + ')';
        
        rowPanel.add(ui.Label(String(value), {
          margin: '2px',
          width: '50px',
          textAlign: 'center',
          backgroundColor: color,
          color: (alpha > 0.5 ? 'white' : 'black'),
          padding: '4px',
          border: '1px solid #333'
        }));
      }
      panel.add(rowPanel);
    }
  });
});

// ---------- AREAS POR CLASE y PIE 3D ----------
var areaImage = ee.Image.pixelArea().divide(10000).addBands(clasificacion);

var areas = areaImage.reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'class'}),
  geometry: zonaEstudio.geometry(),
  scale: 10,
  maxPixels: 1e13
});

var grupos = ee.List(areas.get('groups'));

var areaFC = ee.FeatureCollection(grupos.map(function(el){
  el = ee.Dictionary(el);
  var clase = ee.Number(el.get('class')).toInt();
  var nombre = classNames.get(clase);
  var areaHa = ee.Number(el.get('sum'));
  return ee.Feature(null, {Clase: nombre, Area_ha: areaHa});
}));

print('Áreas por clase:', areaFC);

// Gráfico de torta
var chart = ui.Chart.feature.byFeature({
  features: areaFC,
  xProperty: 'Clase',
  yProperties: ['Area_ha']
})
.setChartType('PieChart')
.setOptions({
  title: 'Distribución de áreas por clase (ha) – Random Forest',
  is3D: true,
  legend: {position: 'right'},
  pieSliceText: 'label',
  backgroundColor: 'transparent',
  titleTextStyle: {fontSize: 16, bold: true},
  slices: {
    0: {color: '#f1c40f'}, 1: {color: '#27ae60'}, 2: {color: '#e67e22'},
    3: {color: '#f39c12'}, 4: {color: '#1abc9c'}, 5: {color: '#9b59b6'},
    6: {color: '#2ecc71'}, 7: {color: '#d35400'}, 8: {color: '#7f8c8d'},
    9: {color: '#3498db'}
  }
});
print(chart);
