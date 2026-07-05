/**
 * MODULE: DATA / translations.js
 * String dictionary for EN / ES.
 * To add a language: duplicate the 'en' block with the new locale key.
 * To add a string: add the key to both blocks.
 */

export const T = {
  en: {
    /* ── Navigation ─────────────────────────── */
    navDashboard: 'Dashboard',
    navPositions: 'Positions',
    navWatchlist: 'Watchlist',
    navCalendar:  'Calendar',
    navSettings:  'Advanced Settings',

    /* ── Header ─────────────────────────────── */
    acctRoth:      'Roth IRA',
    acctBrokerage: 'Brokerage',
    acctCombined:  'Combined',
    acctRothShort: 'Roth',
    acctBrokShort: 'Brok.',
    acctAllShort:  'All',
    marketOpen:    'Market open',
    marketClosed:  'Market closed',
    allTime:       'all-time',

    /* ── Settings panel ─────────────────────── */
    settingsTitle:    'Advanced Settings',
    sectionLanguage:  'Language',
    langEnglish:      'English',
    langSpanish:      'Spanish',
    sectionApiKeys:   'API Keys',
    alpacaKey:        'Alpaca API Key',
    alpacaSecret:     'Alpaca Secret Key',
    finnhubKey:       'Finnhub API Key',
    fmpKey:           'FMP API Key',
    groqKey:          'Groq API Key',
    keyPlaceholder:   'Paste your key here…',
    saveKey:          'Save',
    keySaved:         'Saved ✓',
    showKey:          'Show',
    hideKey:          'Hide',
    configured:       'Configured',
    notConfigured:    'Not configured',
    btnSaveAll:       'Save Changes',
    btnClearKeys:     'Clear All Keys',
    btnClearConfirm:  'Are you sure?',
    btnCancel:        'Cancel',
    allSaved:         'All changes saved',
    keysCleared:      'All keys cleared',
  },

  es: {
    /* ── Navigation ─────────────────────────── */
    navDashboard: 'Panel',
    navPositions: 'Posiciones',
    navWatchlist: 'Watchlist',
    navCalendar:  'Calendario',
    navSettings:  'Configuración',

    /* ── Header ─────────────────────────────── */
    acctRoth:      'Roth IRA',
    acctBrokerage: 'Corretaje',
    acctCombined:  'Combinado',
    acctRothShort: 'Roth',
    acctBrokShort: 'Corr.',
    acctAllShort:  'Todo',
    marketOpen:    'Mercado abierto',
    marketClosed:  'Mercado cerrado',
    allTime:       'total',

    /* ── Settings panel ─────────────────────── */
    settingsTitle:    'Configuración Avanzada',
    sectionLanguage:  'Idioma',
    langEnglish:      'Inglés',
    langSpanish:      'Español',
    sectionApiKeys:   'Claves de API',
    alpacaKey:        'Alpaca API Key',
    alpacaSecret:     'Alpaca Secret Key',
    finnhubKey:       'Finnhub API Key',
    fmpKey:           'FMP API Key',
    groqKey:          'Groq API Key',
    keyPlaceholder:   'Pegá tu clave aquí…',
    saveKey:          'Guardar',
    keySaved:         'Guardado ✓',
    showKey:          'Ver',
    hideKey:          'Ocultar',
    configured:       'Configurada',
    notConfigured:    'No configurada',
    btnSaveAll:       'Guardar Cambios',
    btnClearKeys:     'Borrar Todas las Keys',
    btnClearConfirm:  '¿Estás seguro?',
    btnCancel:        'Cancelar',
    allSaved:         'Todos los cambios guardados',
    keysCleared:      'Todas las keys borradas',
  },
}
