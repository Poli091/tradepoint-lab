/**
 * MODULE: DATA / translations.js
 * EN / ES string dictionary — covers all visible UI text.
 */

export const T = {
  en: {
    /* ── Navigation ─────────────────────────── */
    navDashboard: 'Dashboard',
    navPositions: 'Positions',
    navWatchlist: 'Watchlist',
    navCalendar:  'Calendar',
    navSettings:  'Settings',
    navScanner:   'Scanner',
    navCompare:   'Compare',
    navInsights:  'Portfolio Insights',
    navDiag:      'Model Diagnostics',

    /* ── Header ─────────────────────────────── */
    acctRoth:      'Roth IRA',
    acctBrokerage: 'Brokerage',
    acctCombined:  'Combined',
    acctRothShort: 'Roth',
    acctBrokShort: 'Brok.',
    acctAllShort:  'All',
    marketOpen:       'Market open',
    marketClosed:     'Market closed',
    marketPremarket:  'Pre-market',
    marketAfterHours: 'After hours',
    allTime:       'all-time',

    /* ── Dashboard ──────────────────────────── */
    dashPortfolioValue: 'Portfolio Value',
    dashTotalReturn:    'Total Return',
    dashBestPerformer:  'Best Performer',
    dashAvgConviction:  'Avg Conviction',
    dashPositions:      'positions',
    dashNoPositions:    'No positions',

    /* ── Positions table ────────────────────── */
    colSymbol:    'Symbol',
    colPrice:     'Price',
    colPnL:       'P&L',
    colUpside:    'Upside',
    colConviction:'Conviction',
    colHoldings:  'Holdings',
    noPositions:  'No positions — add some in Positions tab',

    /* ── Watchlist ──────────────────────────── */
    watchlistTitle:  'Watchlist',
    watchlistEmpty:  'No watchlist items',
    watchlistEmptySub: 'Add tickers to track them here',
    watchlistManage: 'Manage',
    watchlistScan:   'Scan watchlist',
    watchlistScanning: 'Scanning',

    /* ── Calendar ───────────────────────────── */
    calendarTitle:   'Earnings Calendar',
    calendarEmpty:   'No upcoming earnings',
    calendarEmptySub:'Click ⚙ Manage to add events',
    calendarManage:  'Manage',
    calendarToday:   'today',
    calendarDaysAway:'days',

    /* ── Scanner ────────────────────────────── */
    scanTitle:       'Ticker Scanner',
    scanPlaceholder: 'Ticker symbol…',
    scanBtn:         'Scan',
    scanRecent:      'Recent Scans',
    scanSectors:     'Sector Validation',

    /* ── Ticker Detail Panel tabs ───────────── */
    tabScore:        'Score',
    tabFundamentals: 'Fundamentals',
    tabAI:           'AI',
    tabMarket:       'Market Intel',

    /* ── Score tab ──────────────────────────── */
    scoreConviction:  'Conviction Score',
    scoreLongTerm:    'Long-Term',
    scoreSwing:       'Swing',
    scoreDecision:    'Decision',
    scoreAlignment:   'Alignment',
    scoreGate:        'Active Gate',
    scoreConfidence:  'confidence',

    /* ── Fundamentals sections ──────────────── */
    secGrowth:      'Growth',
    secQuality:     'Quality',
    secStrength:    'Strength',
    secValuation:   'Valuation',
    secTechnical:   'Technical',
    secRisk:        'Risk',
    secAnalysts:    'Analyst Consensus',
    secFreshness:   'Data Freshness',
    secRecentNews:  'Recent News',

    /* ── Fundamentals rows ──────────────────── */
    rowRevenueYoY:  'Revenue Growth YoY',
    rowRevenue3Y:   'Revenue Growth 3Y',
    rowEpsYoY:      'EPS Growth YoY',
    rowROE:         'ROE',
    rowGrossMargin: 'Gross Margin',
    rowNetMargin:   'Net Margin',
    rowDebt:        'Debt / Equity',
    rowCurrentRatio:'Current Ratio',
    rowPE:          'P/E',
    rowPEG:         'PEG',
    rowForwardPE:   'Forward P/E',
    rowBeta:        'Beta',
    rowUpside:      'Analyst Upside',
    rowBuy:         'Buy / Hold / Sell',
    rowNextEarnings:'Next Earnings',
    rowRSI:         'RSI (14)',
    rowEMA200:      'EMA 200',

    /* ── Data freshness ─────────────────────── */
    freshCached:    'cached',
    freshNotCached: 'Not cached',
    freshRefresh:   'Refresh',
    freshDaysAgo:   'd ago',
    freshDaysLeft:  'd left',

    /* ── AI tab ─────────────────────────────── */
    aiTitle:       'AI Analysis',
    aiMoat:        'Competitive Moat',
    aiBear:        'Bear Case',
    aiCatalysts:   'Key Catalysts',
    aiGenerate:    'Generate',
    aiGenerating:  'Generating…',

    /* ── Market Intel ───────────────────────── */
    miTitle:       'Market Intelligence',
    miGenerate:    'Generate Market Intelligence',
    miSentiment:   'Sentiment',
    miNarrative:   'Narrative',
    miDrivers:     'Drivers',
    miHeadlines:   'Headlines',
    miShowMore:    'Show all',
    miShowLess:    'Show less',
    miVsModel:     'Market vs Model',

    /* ── Compare ────────────────────────────── */
    compareTitle:   'Compare Stocks',
    compareBtn:     'Compare',
    compareSummary: 'Comparison Summary',
    compareLTEdge:  'Long-Term Edge',
    compareTimingEdge: 'Timing Edge',
    compareNoEdge:  'No clear edge',

    /* ── Portfolio Insights ─────────────────── */
    insightsTitle:  'Portfolio Insights',
    insightsReview: 'Portfolio Weekly Review',
    insightsGenerate: 'Generate Review',
    insightsRefresh:  'Refresh',
    insightsAnalyzing:'Analyzing…',

    /* ── Settings panel ─────────────────────── */
    settingsTitle:    'Settings',
    sectionLanguage:  'Language',
    sectionProfile:   'Profile',
    sectionConnection:'Worker Connection',
    sectionAppearance:'Appearance',
    sectionData:      'Data',
    sectionAbout:     'About',
    sectionDanger:    'Danger Zone',
    langEnglish:      'English',
    langSpanish:      'Spanish',
    themeDark:        'Dark',
    themeLight:       'Light',
    btnLockNow:       'Lock now',
    btnClose:         'Close',
    btnImportPortfolio: 'Import Portfolio CSV',
    btnExportPortfolio: 'Export Portfolio CSV',
    btnImportWatchlist: 'Import Watchlist CSV',
    btnExportWatchlist: 'Export Watchlist CSV',
    btnDeleteProfile:   'Delete profile & all data',
    btnDeleteConfirm:   'Confirm — delete everything',
    workerConnected:    'Worker connected',
    workerFailed:       'Connection failed',
    workerChecking:     'Checking…',
    workerConnecting:   'Connecting…',

    /* ── Legacy (kept for compatibility) ───── */
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
    navScanner:   'Scanner',
    navCompare:   'Comparar',
    navInsights:  'Análisis de Cartera',
    navDiag:      'Diagnóstico del Modelo',

    /* ── Header ─────────────────────────────── */
    acctRoth:      'Roth IRA',
    acctBrokerage: 'Corretaje',
    acctCombined:  'Combinado',
    acctRothShort: 'Roth',
    acctBrokShort: 'Corr.',
    acctAllShort:  'Todo',
    marketOpen:       'Mercado abierto',
    marketClosed:     'Mercado cerrado',
    marketPremarket:  'Pre-mercado',
    marketAfterHours: 'Fuera de horario',
    allTime:       'total',

    /* ── Dashboard ──────────────────────────── */
    dashPortfolioValue: 'Valor de Cartera',
    dashTotalReturn:    'Retorno Total',
    dashBestPerformer:  'Mejor Posición',
    dashAvgConviction:  'Convicción Media',
    dashPositions:      'posiciones',
    dashNoPositions:    'Sin posiciones',

    /* ── Positions table ────────────────────── */
    colSymbol:    'Símbolo',
    colPrice:     'Precio',
    colPnL:       'G/P',
    colUpside:    'Potencial',
    colConviction:'Convicción',
    colHoldings:  'Tenencias',
    noPositions:  'Sin posiciones — agregá en la pestaña Posiciones',

    /* ── Watchlist ──────────────────────────── */
    watchlistTitle:  'Watchlist',
    watchlistEmpty:  'Sin elementos en watchlist',
    watchlistEmptySub: 'Agregá tickers para seguirlos aquí',
    watchlistManage: 'Gestionar',
    watchlistScan:   'Escanear watchlist',
    watchlistScanning: 'Escaneando',

    /* ── Calendar ───────────────────────────── */
    calendarTitle:   'Calendario de Resultados',
    calendarEmpty:   'Sin resultados próximos',
    calendarEmptySub:'Hacé clic en ⚙ Gestionar para agregar eventos',
    calendarManage:  'Gestionar',
    calendarToday:   'hoy',
    calendarDaysAway:'días',

    /* ── Scanner ────────────────────────────── */
    scanTitle:       'Scanner de Tickers',
    scanPlaceholder: 'Símbolo…',
    scanBtn:         'Escanear',
    scanRecent:      'Escaneos Recientes',
    scanSectors:     'Validación por Sector',

    /* ── Ticker Detail Panel tabs ───────────── */
    tabScore:        'Score',
    tabFundamentals: 'Fundamentos',
    tabAI:           'IA',
    tabMarket:       'Intel. de Mercado',

    /* ── Score tab ──────────────────────────── */
    scoreConviction:  'Score de Convicción',
    scoreLongTerm:    'Largo Plazo',
    scoreSwing:       'Swing',
    scoreDecision:    'Decisión',
    scoreAlignment:   'Alineación',
    scoreGate:        'Gate Activo',
    scoreConfidence:  'confianza',

    /* ── Fundamentals sections ──────────────── */
    secGrowth:      'Crecimiento',
    secQuality:     'Calidad',
    secStrength:    'Solidez',
    secValuation:   'Valuación',
    secTechnical:   'Técnico',
    secRisk:        'Riesgo',
    secAnalysts:    'Consenso de Analistas',
    secFreshness:   'Frescura de Datos',
    secRecentNews:  'Noticias Recientes',

    /* ── Fundamentals rows ──────────────────── */
    rowRevenueYoY:  'Crecimiento de Ingresos YoY',
    rowRevenue3Y:   'Crecimiento de Ingresos 3A',
    rowEpsYoY:      'Crecimiento EPS YoY',
    rowROE:         'ROE',
    rowGrossMargin: 'Margen Bruto',
    rowNetMargin:   'Margen Neto',
    rowDebt:        'Deuda / Patrimonio',
    rowCurrentRatio:'Razón Corriente',
    rowPE:          'P/E',
    rowPEG:         'PEG',
    rowForwardPE:   'P/E Futuro',
    rowBeta:        'Beta',
    rowUpside:      'Potencial Alcista',
    rowBuy:         'Compra / Mantener / Venta',
    rowNextEarnings:'Próximos Resultados',
    rowRSI:         'RSI (14)',
    rowEMA200:      'EMA 200',

    /* ── Data freshness ─────────────────────── */
    freshCached:    'en caché',
    freshNotCached: 'Sin caché',
    freshRefresh:   'Actualizar',
    freshDaysAgo:   'd atrás',
    freshDaysLeft:  'd restantes',

    /* ── AI tab ─────────────────────────────── */
    aiTitle:       'Análisis IA',
    aiMoat:        'Ventaja Competitiva',
    aiBear:        'Caso Bajista',
    aiCatalysts:   'Catalizadores Clave',
    aiGenerate:    'Generar',
    aiGenerating:  'Generando…',

    /* ── Market Intel ───────────────────────── */
    miTitle:       'Inteligencia de Mercado',
    miGenerate:    'Generar Inteligencia de Mercado',
    miSentiment:   'Sentimiento',
    miNarrative:   'Narrativa',
    miDrivers:     'Impulsores',
    miHeadlines:   'Titulares',
    miShowMore:    'Ver todos',
    miShowLess:    'Ver menos',
    miVsModel:     'Mercado vs Modelo',

    /* ── Compare ────────────────────────────── */
    compareTitle:   'Comparar Acciones',
    compareBtn:     'Comparar',
    compareSummary: 'Resumen Comparativo',
    compareLTEdge:  'Ventaja Largo Plazo',
    compareTimingEdge: 'Ventaja de Timing',
    compareNoEdge:  'Sin ventaja clara',

    /* ── Portfolio Insights ─────────────────── */
    insightsTitle:  'Análisis de Cartera',
    insightsReview: 'Revisión Semanal de Cartera',
    insightsGenerate: 'Generar Revisión',
    insightsRefresh:  'Actualizar',
    insightsAnalyzing:'Analizando…',

    /* ── Settings panel ─────────────────────── */
    settingsTitle:    'Configuración',
    sectionLanguage:  'Idioma',
    sectionProfile:   'Perfil',
    sectionConnection:'Conexión Worker',
    sectionAppearance:'Apariencia',
    sectionData:      'Datos',
    sectionAbout:     'Acerca de',
    sectionDanger:    'Zona de Peligro',
    langEnglish:      'Inglés',
    langSpanish:      'Español',
    themeDark:        'Oscuro',
    themeLight:       'Claro',
    btnLockNow:       'Bloquear ahora',
    btnClose:         'Cerrar',
    btnImportPortfolio: 'Importar Cartera CSV',
    btnExportPortfolio: 'Exportar Cartera CSV',
    btnImportWatchlist: 'Importar Watchlist CSV',
    btnExportWatchlist: 'Exportar Watchlist CSV',
    btnDeleteProfile:   'Eliminar perfil y todos los datos',
    btnDeleteConfirm:   'Confirmar — eliminar todo',
    workerConnected:    'Worker conectado',
    workerFailed:       'Error de conexión',
    workerChecking:     'Verificando…',
    workerConnecting:   'Conectando…',

    /* ── Legacy ─────────────────────────────── */
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
