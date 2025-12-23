# Clasificación Supervisada de Cultivos – Google Earth Engine (Junín)

Clasificación supervisada de uso/cobertura del suelo en el partido de **Junín (Buenos Aires)** utilizando imágenes **Sentinel-2** y el algoritmo **Random Forest** en **Google Earth Engine (GEE)**.

El proyecto incluye:
- Preprocesamiento de imágenes
- Cálculo de índices espectrales
- Entrenamiento y validación del modelo
- Evaluación mediante métricas estadísticas
- Análisis de áreas por clase

---

## 📌 Descripción general

Se realizó una clasificación supervisada multiclase a partir de muestras de entrenamiento (buffers) correspondientes a distintos cultivos y coberturas.  
El modelo fue entrenado con un **80% de las muestras** y validado con el **20% restante**, evaluando su desempeño mediante **matriz de confusión, accuracy, índice Kappa y métricas por clase**.

---

## 🗺️ Área de estudio
- **Región:** Partido de Junín, Provincia de Buenos Aires (Argentina)
- **Tipo:** Área agrícola con presencia de cultivos estivales, urbano y cuerpos de agua

---

## 🛰️ Datos utilizados

### Imágenes satelitales
- **Fuente:** Sentinel-2 Surface Reflectance (COPERNICUS/S2_SR)
- **Período:** Enero 2025
- **Resolución espacial:** 10 m
- **Filtro de nubes:** < 20%

### Assets de Google Earth Engine
Este script utiliza **assets privados** alojados en la cuenta del autor:

- Polígono del partido de Junín (AOI)
- Buffers de entrenamiento por clase (cultivos)

```js
var assetPuntos = 'projects/practica-unahur/assets/Buffer_40m_Cultivos_Junin_2024-2025_geo';
var assetPoligono = 'projects/practica-unahur/assets/Junin';

⚠️ Nota:
Para ejecutar el script en otra cuenta de GEE es necesario reemplazar estas rutas por assets propios o importar los datos correspondientes.

🧠 Clases de cobertura

Maní

Alfalfa

Campo Natural

Maíz

Maíz (2da)

Soja (1era)

Soja (2da)

Sorgo

Urbano

Agua

Cada clase es convertida a un índice numérico para el entrenamiento del clasificador.

📊 Metodología
Índices espectrales calculados

NDVI

EVI

GNDVI

NDWI

SAVI

NBR

Estos índices se agregan como bandas adicionales a la imagen base de Sentinel-2.

Clasificación

Algoritmo: Random Forest

Cantidad de árboles: 50

Semilla: fija para reproducibilidad

Variables de entrada: bandas espectrales + índices

División de muestras

Entrenamiento: 80%

Validación: 20%

División aleatoria controlada por semilla

📈 Evaluación del modelo

Se calculan las siguientes métricas sobre el conjunto de validación:

Matriz de confusión

Accuracy global

Índice Kappa

Métricas por clase:

True Positives (TP)

False Positives (FP)

False Negatives (FN)

Precision

Recall

F1-Score

Además, se genera:

Heatmap interactivo de la matriz de confusión en la interfaz de GEE

Exportación opcional de métricas a CSV

📐 Análisis de áreas

Cálculo del área total por clase (hectáreas)

Gráfico de torta 3D con la distribución espacial de coberturas

🛠️ Tecnologías utilizadas

Google Earth Engine

JavaScript

Sentinel-2

Random Forest (smileRandomForest)

🎓 Contexto académico

Proyecto realizado en el marco de una práctica académica universitaria, con fines de análisis y aprendizaje en teledetección y clasificación supervisada.

👤 Autor

Mauricio Arango

📎 Notas finales

Este repositorio contiene únicamente el script de procesamiento y análisis.
Los datos de entrada (assets) deben ser proporcionados por cada usuario en su propia cuenta de Google Earth Engine.

Este proyecto fue realizado como parte de una PPS (practica profesional supervisada) entre la UNAHUR y el INTA, mas concretamente el Instituto de Clima y Agua.



