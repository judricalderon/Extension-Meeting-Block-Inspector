# Calendar-Analytics

## Table of Contents

- [English](#--------------english--------------)
  - [Overview](#overview)
  - [Features](#features)
  - [How It Works](#how-it-works)
  - [Architecture](#architecture)
  - [File Structure](#file-structure)
  - [Configuration](#configuration)
  - [OAuth Setup](#oauth-setup)
  - [CSV Format](#csv-format)
  - [Criteria Logic](#criteria-logic)
  - [Build and Installation](#build-and-installation)
  - [Permissions Justification](#permissions-justification)
  - [Limitations](#limitations)
  - [Planned Enhancements](#planned-enhancements)
  - [License](#license)
  - [Contributors](#contributors)

- [Spanish](#--------------spanish--------------)
  - [Descripción general](#descripción-general)
  - [Características](#características)
  - [Cómo funciona](#cómo-funciona)
  - [Arquitectura](#arquitectura)
  - [Estructura de archivos](#estructura-de-archivos)
  - [Configuración](#configuración)
  - [Configuración de OAuth](#configuración-de-oauth)
  - [Formato de los CSV](#formato-de-los-csv)
  - [Lógica de criterios](#lógica-de-criterios)
  - [Instalación en modo desarrollo](#instalación-en-modo-desarrollo)
  - [Permisos utilizados](#permisos-utilizados)
  - [Limitaciones](#limitaciones-1)
  - [Próximas mejoras previstas](#próximas-mejoras-previstas)
  - [Licencia](#licencia)
  - [Autor](#autor)


# --------------English--------------
Google Calendar meeting-block analysis and CSV reporting Chrome Extension

## Overview

Calendar-Analytics is a Chrome extension designed to analyze Google Calendar availability across multiple users and generate detailed CSV reports. It supports two main types of reports:

- Standard availability and meeting-block report.

- Criteria-based report that evaluates calendar hygiene according to configurable rules.

The extension retrieves events directly from Google Calendar using OAuth, processes them using a customizable workday configuration, and exports structured CSV files that can be used for analytics, management workflows, or automated notifications.

## Features

### Google OAuth integration
Users authenticate using their Google Calendar account through chrome.identity.

### CSV email import
Upload a CSV file containing a list of user emails to analyze.

### Workday configuration
Customizable settings including workday start/end time, minimum block length and long-block detection.

### Dual-day reporting logic
Reports are generated over two days (automatic or custom-selected), enabling trend comparison.

### Busy and free block extraction
Calendar events are converted into structured availability blocks.

### Criteria evaluation engine
Generates pass/fail results based on selected thresholds and produces Slack-ready messages.

### Error reporting
Calendars that cannot be accessed are automatically logged in the output.

### Full Manifest V3 compatibility
Downloads are executed via data URLs and the chrome.downloads API.

## How It Works

### User workflow
Open the popup.
Authenticate with Google Calendar.
Upload a CSV containing the list of email addresses.
Select the main date and (optionally) a custom second date.
Generate either the standard CSV or the criteria-based CSV.

### Internal workflow
The popup sends a message to the background service.
The background retrieves the OAuth token and configuration.
Events for each email are fetched from Google Calendar.
The calendarAnalyzer processes busy/free blocks.
The csvService formats and downloads the final CSV file.

## Architecture

### popup/
User interface for authentication, CSV upload, date selection, and report generation.

### background/
Handles long-running operations, API calls, and CSV download triggers.

### services/
```
googleAuth.js — Google OAuth flow and token management.
calendarApi.js — Event retrieval and normalization.
calendarAnalyzer.js — Busy/free block extraction.
csvService.js — CSV builders and download utilities.
```
### storage/
```
storage.js — Persistent user configuration storage.
```
### options/
Options UI where users configure workday hours and OAuth client ID.
```
File Structure
src/
  background/
    background.js
  popup/
    popup.html
    popup.js
    popup.css
  options/
    options.html
    options.js
    options.css
  services/
    googleAuth.js
    calendarApi.js
    calendarAnalyzer.js
    csvService.js
  storage/
    storage.js
manifest.json
```
## Configuration

The extension stores user settings in chrome.storage.local.
Defaults are defined in storage.js:
```
workdayStart: "07:00"
workdayEnd: "17:00"
minBlockMinutes: 30
maxStandardBlockMinutes: 60
googleClientId: ""
```

If no Google Client ID is provided, googleAuth.js uses the built-in DEFAULT_CLIENT_ID.

## OAuth Setup

To use your own Google Cloud Project:

- Create an OAuth Client (type: Web Application).

- Add your Chrome extension redirect URL:
    URL = https://<extension-id>.chromiumapp.org/

- Copy your client ID.

- Open the extension Options page and paste it into the “Google Client ID” field.

If left blank, the extension will use the predefined Client ID.

## CSV Format
### Standard Report Columns

email
date
type
title
from
to
duration_minutes
is_long

### Criteria Report Columns

email
passed
criteria_passed
criteria_failed
slack_message
day1
day2

## Criteria Logic

Day-based availability is computed over a 9-hour workday (540 minutes).

A user passes the evaluation if:

- No meeting block is longer than the configured maximum (default 60 minutes).

- Day 1 availability is 30 percent or less.

- Day 2 availability is 70 percent or less.

A Slack-optimized message is automatically generated depending on which criteria were satisfied or violated.

## Build and Installation

- Run your build step (if applicable).

- Open Chrome → Extensions → Enable Developer Mode.

- Click “Load unpacked”.

- Select the project folder containing manifest.json.

## Permissions Justification

```
identity — Used for OAuth authentication with Google.
storage — Used to persist configuration settings.
downloads — Required to generate CSV downloads.
scripting and activeTab — Required for MV3 popup and background interactions.
```

## Limitations

Only Google Calendar events readable by the authenticated user are included.
All-day events are currently ignored in block generation.
CSV exports use UTF-8 encoding without BOM.
OAuth tokens cannot be refreshed silently due to browser security constraints.

## Planned Enhancements

Support for all-day event classification.
Export in XLSX format.
Slack webhook automation instead of manual message copying.
Team-level dashboard within the extension options UI.
More granular availability rules.

## License

MIT License. Feel free to modify or integrate into your workflow.

## Contributors

Developed by Juan David 

# --------------Spanish--------------

Extensión de Chrome para análisis de Google Calendar y generación de reportes CSV

## Descripción general

Calendar-Analytics es una extensión de Chrome diseñada para analizar la disponibilidad en Google Calendar de múltiples usuarios y generar reportes CSV detallados. La herramienta permite dos tipos principales de reportes:

- Reporte estándar de disponibilidad y bloques de reuniones.

- Reporte basado en criterios, que evalúa la “higiene” del calendario según reglas configurables.

La extensión obtiene los eventos directamente desde Google Calendar mediante OAuth, procesa la información usando una configuración de jornada laboral personalizable y exporta archivos CSV que pueden utilizarse para análisis, gestión de equipos o automatización de alertas.

## Características

### Autenticación con Google OAuth
El usuario se conecta con su cuenta de Google Calendar a través de chrome.identity.

### Carga de CSV con correos
Permite cargar un archivo CSV que contenga la lista de correos a analizar.

### Configuración de jornada laboral
Horario de inicio y fin del día laboral, duración mínima de bloques y detección de bloques largos.

### Lógica de reporte para dos días
Los reportes se generan usando dos días (automáticos o definidos manualmente), facilitando comparaciones.

### Extracción de bloques ocupados y libres
Los eventos del calendario se convierten en bloques estructurados.

### Evaluación basada en criterios
Genera resultados de aprobado/no aprobado según reglas establecidas y mensajes listos para Slack.

### Manejo de errores por calendario inaccesible
Los calendarios que no se pueden leer se registran en el CSV final.

### Compatibilidad total con Manifest V3
Las descargas utilizan data URLs y la API chrome.downloads.

## Cómo funciona

#### Flujo del usuario
Abrir la ventana emergente.
Autenticarse con Google Calendar.
Subir un CSV con correos electrónicos.
Seleccionar la fecha principal y, si se desea, una segunda fecha personalizada.
Generar el reporte estándar o el reporte por criterios.

### Flujo interno
El popup envía un mensaje al servicio de background.
El servicio obtiene el token OAuth y la configuración.
Se consultan los eventos de Google Calendar para cada correo.
calendarAnalyzer procesa los bloques libres/ocupados.
csvService genera el archivo CSV descargable.

## Arquitectura

### popup/
Interfaz donde el usuario se autentica, carga el CSV y selecciona las fechas para generar reportes.

#### background/
Ejecuta tareas de larga duración, llama a la API y dispara la descarga del CSV.

### services/
```
googleAuth.js — Manejo de OAuth y tokens.
calendarApi.js — Obtención y normalización de eventos.
calendarAnalyzer.js — Conversión a bloques libres/ocupados.
csvService.js — Construcción y descarga de archivos CSV.
```
### storage/
```
storage.js — Manejo persistente de configuración del usuario.
```
### options/
Interfaz de configuración avanzada de la extensión.

## Estructura de archivos
```
src/
  background/
    background.js
  popup/
    popup.html
    popup.js
    popup.css
  options/
    options.html
    options.js
    options.css
  services/
    googleAuth.js
    calendarApi.js
    calendarAnalyzer.js
    csvService.js
  storage/
    storage.js
manifest.json
```
## Configuración

La extensión guarda la configuración del usuario en chrome.storage.local.
Los valores predeterminados se encuentran en storage.js:

```
workdayStart: "07:00"
workdayEnd: "17:00"
minBlockMinutes: 30
maxStandardBlockMinutes: 60
googleClientId: ""
```

Si no se configura un Client ID, googleAuth.js utiliza un ID predeterminado.

## Configuración de OAuth

Para usar tu propio proyecto de Google Cloud:

- Crear un cliente OAuth tipo “Web Application”.

- Agregar la URL de redirección de la extensión:
    URL = https://<extension-id>.chromiumapp.org/

- Copiar el Client ID.

- Abrir la página de Opciones de la extensión y pegar el Client ID en el campo correspondiente.

Si se deja vacío, la extensión utiliza un Client ID predefinido.

## Formato de los CSV
### Reporte estándar

email
date
type
title
from
to
duration_minutes
is_long

### Reporte por criterios

email
passed
criteria_passed
criteria_failed
slack_message
day1
day2

## Lógica de criterios

La disponibilidad diaria se calcula sobre una jornada laboral de 9 horas (540 minutos).

Un usuario pasa la evaluación si cumple lo siguiente:

1. No existen bloques de más de 60 minutos (por defecto).

2. El primer día tiene disponibilidad menor o igual al 30%.

3. El segundo día tiene disponibilidad menor o igual al 70%.

También se genera un mensaje preparado para Slack según el desempeño del usuario.

## Instalación en modo desarrollo

1. Ejecutar la etapa de build si aplica.

2. Abrir Chrome → Extensiones → Activar modo desarrollador.

3. Seleccionar “Cargar descomprimida”.

4. Elegir la carpeta que contiene manifest.json.

## Permisos utilizados
```
identity — Requerido para autenticación OAuth.
storage — Para guardar la configuración del usuario.
downloads — Para generar y descargar archivos CSV.
scripting y activeTab — Utilizados por el popup y el servicio de fondo.
```
## Limitaciones

Solo se analizan los calendarios accesibles por el usuario autenticado.
Los eventos de día completo se ignoran actualmente.
Los CSV se exportan en UTF-8 sin BOM.
Por razones de seguridad del navegador, no es posible refrescar tokens silenciosamente.

## Próximas mejoras previstas

Soporte para eventos de día completo.
Exportación a formato XLSX.
Automatización completa de envío de mensajes por Slack.
Vista tipo dashboard dentro de la extensión.
Reglas de disponibilidad más detalladas.

## Licencia

Proyecto distribuido bajo licencia MIT.

## Autor

Desarrollado por Juan David.