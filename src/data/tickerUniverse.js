/**
 * MODULE: DATA / tickerUniverse.js
 * Static metadata for ~160 tickers across all 11 GICS sectors.
 * No API calls needed — sector classification, ETF mapping, and SPY/QQQ flags
 * are stable metadata that rarely changes.
 *
 * Used for:
 *  · Sector peer comparison (compare NVDA against all IT sector peers)
 *  · SPY/QQQ universe filtering
 *  · Screener base universe
 *  · Building the fundamentals database progressively
 *
 * To add a ticker: find its sector array and append the object.
 * spyWeight is approximate % weight in the S&P 500 index.
 */

export const UNIVERSE = [
  /* ══════════════════════════════════════════════════════
     INFORMATION TECHNOLOGY — XLK (~31% of SPY)
  ══════════════════════════════════════════════════════ */
  // Semiconductors
  { ticker:'NVDA', name:'NVIDIA',               sector:'Information Technology', industry:'Semiconductors',        sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:6.20 },
  { ticker:'AVGO', name:'Broadcom',              sector:'Information Technology', industry:'Semiconductors',        sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:2.10 },
  { ticker:'AMD',  name:'Advanced Micro Devices',sector:'Information Technology', industry:'Semiconductors',        sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.60 },
  { ticker:'MU',   name:'Micron Technology',     sector:'Information Technology', industry:'Semiconductors',        sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.35 },
  { ticker:'QCOM', name:'Qualcomm',              sector:'Information Technology', industry:'Semiconductors',        sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.45 },
  { ticker:'INTC', name:'Intel',                 sector:'Information Technology', industry:'Semiconductors',        sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.20 },
  { ticker:'MRVL', name:'Marvell Technology',    sector:'Information Technology', industry:'Semiconductors',        sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.25 },
  { ticker:'ARM',  name:'Arm Holdings',          sector:'Information Technology', industry:'Semiconductors',        sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.40 },
  { ticker:'AMAT', name:'Applied Materials',     sector:'Information Technology', industry:'Semiconductor Equipment',sectorEtf:'XLK', inSPY:true, inQQQ:true, spyWeight:0.45 },
  { ticker:'LRCX', name:'Lam Research',          sector:'Information Technology', industry:'Semiconductor Equipment',sectorEtf:'XLK', inSPY:true, inQQQ:true, spyWeight:0.30 },
  { ticker:'KLAC', name:'KLA Corporation',       sector:'Information Technology', industry:'Semiconductor Equipment',sectorEtf:'XLK', inSPY:true, inQQQ:true, spyWeight:0.28 },
  { ticker:'TXN',  name:'Texas Instruments',     sector:'Information Technology', industry:'Semiconductors',        sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.40 },
  // Software
  { ticker:'MSFT', name:'Microsoft',             sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:6.80 },
  { ticker:'NOW',  name:'ServiceNow',            sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.55 },
  { ticker:'TEAM', name:'Atlassian',             sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:false,inQQQ:true,  spyWeight:0    },
  { ticker:'VEEV', name:'Veeva Systems',         sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:false, spyWeight:0.18 },
  { ticker:'CRM',  name:'Salesforce',            sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.60 },
  { ticker:'ADBE', name:'Adobe',                 sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.45 },
  { ticker:'ORCL', name:'Oracle',                sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.80 },
  { ticker:'INTU', name:'Intuit',                sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.45 },
  { ticker:'SNOW', name:'Snowflake',             sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.18 },
  { ticker:'DDOG', name:'Datadog',               sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.15 },
  { ticker:'WDAY', name:'Workday',               sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.20 },
  { ticker:'GTLB', name:'GitLab',                sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:false,inQQQ:false, spyWeight:0    },
  // IT Services & Hardware
  { ticker:'AAPL', name:'Apple',                 sector:'Information Technology', industry:'Technology Hardware',   sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:7.10 },
  { ticker:'PLTR', name:'Palantir',              sector:'Information Technology', industry:'Software',              sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.35 },
  // Cybersecurity
  { ticker:'PANW', name:'Palo Alto Networks',    sector:'Information Technology', industry:'Cybersecurity',         sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.35 },
  { ticker:'CRWD', name:'CrowdStrike',           sector:'Information Technology', industry:'Cybersecurity',         sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.30 },
  { ticker:'ZS',   name:'Zscaler',               sector:'Information Technology', industry:'Cybersecurity',         sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.15 },
  { ticker:'NET',  name:'Cloudflare',            sector:'Information Technology', industry:'Cybersecurity',         sectorEtf:'XLK', inSPY:false,inQQQ:false, spyWeight:0    },

  /* ══════════════════════════════════════════════════════
     COMMUNICATION SERVICES — XLC (~9% of SPY)
  ══════════════════════════════════════════════════════ */
  { ticker:'META',  name:'Meta Platforms',       sector:'Communication Services', industry:'Social Media',          sectorEtf:'XLC', inSPY:true, inQQQ:true,  spyWeight:2.60 },
  { ticker:'GOOGL', name:'Alphabet Class A',     sector:'Communication Services', industry:'Internet Services',     sectorEtf:'XLC', inSPY:true, inQQQ:true,  spyWeight:2.10 },
  { ticker:'GOOG',  name:'Alphabet Class C',     sector:'Communication Services', industry:'Internet Services',     sectorEtf:'XLC', inSPY:true, inQQQ:true,  spyWeight:1.80 },
  { ticker:'NFLX',  name:'Netflix',              sector:'Communication Services', industry:'Streaming',             sectorEtf:'XLC', inSPY:true, inQQQ:true,  spyWeight:0.75 },
  { ticker:'APP',   name:'AppLovin',             sector:'Communication Services', industry:'Ad-Tech',               sectorEtf:'XLC', inSPY:true, inQQQ:true,  spyWeight:0.50 },
  { ticker:'TTD',   name:'The Trade Desk',       sector:'Communication Services', industry:'Ad-Tech',               sectorEtf:'XLC', inSPY:false,inQQQ:true,  spyWeight:0    },
  { ticker:'DIS',   name:'Walt Disney',          sector:'Communication Services', industry:'Entertainment',         sectorEtf:'XLC', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'VZ',    name:'Verizon',              sector:'Communication Services', industry:'Telecom',               sectorEtf:'XLC', inSPY:true, inQQQ:false, spyWeight:0.30 },
  { ticker:'T',     name:'AT&T',                 sector:'Communication Services', industry:'Telecom',               sectorEtf:'XLC', inSPY:true, inQQQ:false, spyWeight:0.35 },

  /* ══════════════════════════════════════════════════════
     CONSUMER DISCRETIONARY — XLY (~10% of SPY)
  ══════════════════════════════════════════════════════ */
  { ticker:'AMZN', name:'Amazon',                sector:'Consumer Discretionary', industry:'E-Commerce',           sectorEtf:'XLY', inSPY:true, inQQQ:true,  spyWeight:3.80 },
  { ticker:'TSLA', name:'Tesla',                 sector:'Consumer Discretionary', industry:'Electric Vehicles',    sectorEtf:'XLY', inSPY:true, inQQQ:true,  spyWeight:1.50 },
  { ticker:'MELI', name:'MercadoLibre',          sector:'Consumer Discretionary', industry:'E-Commerce LatAm',     sectorEtf:'XLY', inSPY:false,inQQQ:true,  spyWeight:0    },
  { ticker:'SE',   name:'Sea Limited',           sector:'Consumer Discretionary', industry:'E-Commerce SEA',       sectorEtf:'XLY', inSPY:false,inQQQ:false, spyWeight:0    },
  { ticker:'BABA', name:'Alibaba',               sector:'Consumer Discretionary', industry:'E-Commerce China',     sectorEtf:'XLY', inSPY:false,inQQQ:false, spyWeight:0    },
  { ticker:'SHOP', name:'Shopify',               sector:'Consumer Discretionary', industry:'E-Commerce Infra',     sectorEtf:'XLY', inSPY:false,inQQQ:true,  spyWeight:0    },
  { ticker:'BKNG', name:'Booking Holdings',      sector:'Consumer Discretionary', industry:'Online Travel',        sectorEtf:'XLY', inSPY:true, inQQQ:true,  spyWeight:0.50 },
  { ticker:'UBER', name:'Uber',                  sector:'Consumer Discretionary', industry:'Ride-Sharing',         sectorEtf:'XLY', inSPY:true, inQQQ:false, spyWeight:0.30 },
  { ticker:'NKE',  name:'Nike',                  sector:'Consumer Discretionary', industry:'Footwear',             sectorEtf:'XLY', inSPY:true, inQQQ:false, spyWeight:0.25 },
  { ticker:'HD',   name:'Home Depot',            sector:'Consumer Discretionary', industry:'Home Improvement',     sectorEtf:'XLY', inSPY:true, inQQQ:false, spyWeight:0.70 },
  { ticker:'LOW',  name:"Lowe's",                sector:'Consumer Discretionary', industry:'Home Improvement',     sectorEtf:'XLY', inSPY:true, inQQQ:false, spyWeight:0.40 },

  /* ══════════════════════════════════════════════════════
     HEALTH CARE — XLV (~12% of SPY)
  ══════════════════════════════════════════════════════ */
  { ticker:'LLY',  name:'Eli Lilly',             sector:'Health Care', industry:'Pharmaceuticals',                 sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:1.80 },
  { ticker:'UNH',  name:'UnitedHealth',          sector:'Health Care', industry:'Health Insurance',                sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:1.30 },
  { ticker:'ABBV', name:'AbbVie',                sector:'Health Care', industry:'Pharmaceuticals',                 sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.70 },
  { ticker:'MRK',  name:'Merck',                 sector:'Health Care', industry:'Pharmaceuticals',                 sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.55 },
  { ticker:'AMGN', name:'Amgen',                 sector:'Health Care', industry:'Biotech',                         sectorEtf:'XLV', inSPY:true, inQQQ:true,  spyWeight:0.40 },
  { ticker:'GILD', name:'Gilead Sciences',       sector:'Health Care', industry:'Biotech',                         sectorEtf:'XLV', inSPY:true, inQQQ:true,  spyWeight:0.30 },
  { ticker:'VRTX', name:'Vertex Pharmaceuticals',sector:'Health Care', industry:'Biotech',                         sectorEtf:'XLV', inSPY:true, inQQQ:true,  spyWeight:0.35 },
  { ticker:'REGN', name:'Regeneron',             sector:'Health Care', industry:'Biotech',                         sectorEtf:'XLV', inSPY:true, inQQQ:true,  spyWeight:0.28 },
  { ticker:'ISRG', name:'Intuitive Surgical',    sector:'Health Care', industry:'Medical Devices',                 sectorEtf:'XLV', inSPY:true, inQQQ:true,  spyWeight:0.40 },
  { ticker:'BSX',  name:'Boston Scientific',     sector:'Health Care', industry:'Medical Devices',                 sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.30 },
  { ticker:'MDT',  name:'Medtronic',             sector:'Health Care', industry:'Medical Devices',                 sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'ABT',  name:'Abbott Laboratories',   sector:'Health Care', industry:'Medical Devices',                 sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.50 },
  { ticker:'SYK',  name:'Stryker',               sector:'Health Care', industry:'Medical Devices',                 sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.38 },
  { ticker:'PODD', name:'Insulet Corp',          sector:'Health Care', industry:'Medical Devices',                 sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.10 },
  { ticker:'DXCM', name:'DexCom',                sector:'Health Care', industry:'Medical Devices',                 sectorEtf:'XLV', inSPY:true, inQQQ:true,  spyWeight:0.12 },
  { ticker:'EW',   name:'Edwards Lifesciences',  sector:'Health Care', industry:'Medical Devices',                 sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.15 },

  /* ══════════════════════════════════════════════════════
     FINANCIALS — XLF (~13% of SPY)
  ══════════════════════════════════════════════════════ */
  { ticker:'JPM',  name:'JPMorgan Chase',        sector:'Financials', industry:'Banks',                            sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:1.50 },
  { ticker:'BAC',  name:'Bank of America',       sector:'Financials', industry:'Banks',                            sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.65 },
  { ticker:'WFC',  name:'Wells Fargo',           sector:'Financials', industry:'Banks',                            sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.50 },
  { ticker:'GS',   name:'Goldman Sachs',         sector:'Financials', industry:'Investment Banking',               sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.50 },
  { ticker:'MS',   name:'Morgan Stanley',        sector:'Financials', industry:'Investment Banking',               sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'BLK',  name:'BlackRock',             sector:'Financials', industry:'Asset Management',                 sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'SCHW', name:'Charles Schwab',        sector:'Financials', industry:'Brokerage',                        sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'SPGI', name:'S&P Global',            sector:'Financials', industry:'Financial Data',                   sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.45 },
  { ticker:'MCO',  name:"Moody's",               sector:'Financials', industry:'Financial Data',                   sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'FICO', name:'FICO',                  sector:'Financials', industry:'Financial Data/Scores',            sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.20 },
  { ticker:'V',    name:'Visa',                  sector:'Financials', industry:'Payment Networks',                 sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:1.10 },
  { ticker:'MA',   name:'Mastercard',            sector:'Financials', industry:'Payment Networks',                 sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.90 },
  { ticker:'PYPL', name:'PayPal',                sector:'Financials', industry:'Fintech',                          sectorEtf:'XLF', inSPY:true, inQQQ:true,  spyWeight:0.20 },
  { ticker:'NU',   name:'Nu Holdings',           sector:'Financials', industry:'Fintech LatAm',                   sectorEtf:'XLF', inSPY:false,inQQQ:false, spyWeight:0    },
  { ticker:'SOFI', name:'SoFi Technologies',     sector:'Financials', industry:'Fintech',                          sectorEtf:'XLF', inSPY:false,inQQQ:false, spyWeight:0    },

  /* ══════════════════════════════════════════════════════
     INDUSTRIALS — XLI (~8% of SPY)
  ══════════════════════════════════════════════════════ */
  { ticker:'AXON', name:'Axon Enterprise',       sector:'Industrials', industry:'Defense Tech',                    sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.22 },
  { ticker:'LMT',  name:'Lockheed Martin',       sector:'Industrials', industry:'Aerospace & Defense',             sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.35 },
  { ticker:'NOC',  name:'Northrop Grumman',      sector:'Industrials', industry:'Aerospace & Defense',             sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.22 },
  { ticker:'RTX',  name:'RTX Corporation',       sector:'Industrials', industry:'Aerospace & Defense',             sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'GD',   name:'General Dynamics',      sector:'Industrials', industry:'Aerospace & Defense',             sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.22 },
  { ticker:'GE',   name:'GE Aerospace',          sector:'Industrials', industry:'Aerospace',                       sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.70 },
  { ticker:'CAT',  name:'Caterpillar',           sector:'Industrials', industry:'Machinery',                       sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.55 },
  { ticker:'HON',  name:'Honeywell',             sector:'Industrials', industry:'Conglomerate',                    sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'TRMB', name:'Trimble',               sector:'Industrials', industry:'Industrial Tech',                 sectorEtf:'XLI', inSPY:false,inQQQ:false, spyWeight:0    },
  { ticker:'VRT',  name:'Vertiv Holdings',       sector:'Industrials', industry:'Data Center Infra',               sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.22 },

  /* ══════════════════════════════════════════════════════
     ENERGY — XLE (~3% of SPY)
  ══════════════════════════════════════════════════════ */
  { ticker:'VST',  name:'Vistra Energy',         sector:'Energy', industry:'Power Generation/Nuclear',             sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.25 },
  { ticker:'CEG',  name:'Constellation Energy',  sector:'Energy', industry:'Nuclear Power',                        sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'XOM',  name:'ExxonMobil',            sector:'Energy', industry:'Integrated Oil & Gas',                 sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.70 },
  { ticker:'CVX',  name:'Chevron',               sector:'Energy', industry:'Integrated Oil & Gas',                 sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.50 },
  { ticker:'COP',  name:'ConocoPhillips',        sector:'Energy', industry:'Oil & Gas Exploration',                sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'NEE',  name:'NextEra Energy',        sector:'Energy', industry:'Renewable Energy',                     sectorEtf:'XLU', inSPY:true, inQQQ:false, spyWeight:0.35 },
  { ticker:'NRG',  name:'NRG Energy',            sector:'Energy', industry:'Power Generation',                     sectorEtf:'XLU', inSPY:true, inQQQ:false, spyWeight:0.12 },
  { ticker:'ETR',  name:'Entergy',               sector:'Energy', industry:'Electric Utilities',                   sectorEtf:'XLU', inSPY:true, inQQQ:false, spyWeight:0.10 },
  { ticker:'OKLO', name:'Oklo',                  sector:'Energy', industry:'Nuclear — Small Modular Reactors',     sectorEtf:'XLU', inSPY:false,inQQQ:false, spyWeight:0    },
  { ticker:'SMR',  name:'NuScale Power',         sector:'Energy', industry:'Nuclear — Small Modular Reactors',     sectorEtf:'XLU', inSPY:false,inQQQ:false, spyWeight:0    },

  /* ══════════════════════════════════════════════════════
     CONSUMER STAPLES — XLP (~6% of SPY)
  ══════════════════════════════════════════════════════ */
  { ticker:'WMT',  name:'Walmart',               sector:'Consumer Staples', industry:'Mass Retail',                sectorEtf:'XLP', inSPY:true, inQQQ:false, spyWeight:0.90 },
  { ticker:'COST', name:'Costco',                sector:'Consumer Staples', industry:'Wholesale Clubs',            sectorEtf:'XLP', inSPY:true, inQQQ:true,  spyWeight:0.80 },
  { ticker:'PG',   name:'Procter & Gamble',      sector:'Consumer Staples', industry:'Household Products',         sectorEtf:'XLP', inSPY:true, inQQQ:false, spyWeight:0.70 },
  { ticker:'KO',   name:'Coca-Cola',             sector:'Consumer Staples', industry:'Beverages',                  sectorEtf:'XLP', inSPY:true, inQQQ:false, spyWeight:0.55 },
  { ticker:'PEP',  name:'PepsiCo',               sector:'Consumer Staples', industry:'Beverages',                  sectorEtf:'XLP', inSPY:true, inQQQ:true,  spyWeight:0.50 },

  /* ══════════════════════════════════════════════════════
     MATERIALS — XLB (~2% of SPY)
  ══════════════════════════════════════════════════════ */
  { ticker:'LIN',  name:'Linde',                 sector:'Materials', industry:'Industrial Gases',                  sectorEtf:'XLB', inSPY:true, inQQQ:false, spyWeight:0.45 },
  { ticker:'APD',  name:'Air Products',          sector:'Materials', industry:'Industrial Gases',                  sectorEtf:'XLB', inSPY:true, inQQQ:false, spyWeight:0.18 },
  { ticker:'FCX',  name:'Freeport-McMoRan',      sector:'Materials', industry:'Copper Mining',                     sectorEtf:'XLB', inSPY:true, inQQQ:false, spyWeight:0.15 },

  /* ══════════════════════════════════════════════════════
     REAL ESTATE — XLRE (~2% of SPY)
  ══════════════════════════════════════════════════════ */
  { ticker:'AMT',  name:'American Tower',        sector:'Real Estate', industry:'Cell Tower REITs',                sectorEtf:'XLRE',inSPY:true, inQQQ:false, spyWeight:0.22 },
  { ticker:'PLD',  name:'Prologis',              sector:'Real Estate', industry:'Industrial REITs',                sectorEtf:'XLRE',inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'EQIX', name:'Equinix',               sector:'Real Estate', industry:'Data Center REITs',               sectorEtf:'XLRE',inSPY:true, inQQQ:false, spyWeight:0.22 },


  /* ══════════════════════════════════════════════════════
     INDUSTRIALS — XLI (~8% of SPY)
  ══════════════════════════════════════════════════════ */
  { ticker:'CAT',  name:'Caterpillar',       sector:'Industrials', industry:'Machinery',           sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.55 },
  { ticker:'HON',  name:'Honeywell',          sector:'Industrials', industry:'Conglomerate',        sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'DE',   name:'Deere & Company',    sector:'Industrials', industry:'Agriculture Machinery',sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.35 },
  { ticker:'ETN',  name:'Eaton',              sector:'Industrials', industry:'Power Management',    sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.38 },
  { ticker:'PH',   name:'Parker Hannifin',    sector:'Industrials', industry:'Industrial Motion',   sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'EMR',  name:'Emerson Electric',   sector:'Industrials', industry:'Automation',          sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.22 },
  { ticker:'ITW',  name:'Illinois Tool Works', sector:'Industrials', industry:'Diversified Mfg',   sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'MMM',  name:'3M',                 sector:'Industrials', industry:'Diversified',         sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.18 },
  { ticker:'CARR', name:'Carrier Global',     sector:'Industrials', industry:'HVAC',                sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.18 },
  { ticker:'TT',   name:'Trane Technologies', sector:'Industrials', industry:'Climate Solutions',   sectorEtf:'XLI', inSPY:true, inQQQ:false, spyWeight:0.22 },

  /* ══════════════════════════════════════════════════════
     FINANCIALS — XLF (non-payment, non-fintech)
  ══════════════════════════════════════════════════════ */
  { ticker:'GS',   name:'Goldman Sachs',      sector:'Financials', industry:'Investment Banking',   sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.50 },
  { ticker:'MS',   name:'Morgan Stanley',     sector:'Financials', industry:'Investment Banking',   sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'BLK',  name:'BlackRock',          sector:'Financials', industry:'Asset Management',     sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'SCHW', name:'Charles Schwab',     sector:'Financials', industry:'Brokerage',            sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'CB',   name:'Chubb',              sector:'Financials', industry:'Insurance',            sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'AXP',  name:'American Express',   sector:'Financials', industry:'Credit Services',      sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.35 },

  /* ══════════════════════════════════════════════════════
     CONSUMER DISCRETIONARY — XLY
  ══════════════════════════════════════════════════════ */
  { ticker:'TSLA', name:'Tesla',              sector:'Consumer Discretionary', industry:'Electric Vehicles',  sectorEtf:'XLY', inSPY:true, inQQQ:true,  spyWeight:1.50 },
  { ticker:'HD',   name:'Home Depot',         sector:'Consumer Discretionary', industry:'Home Improvement',   sectorEtf:'XLY', inSPY:true, inQQQ:false, spyWeight:0.70 },
  { ticker:'BKNG', name:'Booking Holdings',   sector:'Consumer Discretionary', industry:'Online Travel',      sectorEtf:'XLY', inSPY:true, inQQQ:true,  spyWeight:0.50 },
  { ticker:'MCD',  name:"McDonald's",         sector:'Consumer Discretionary', industry:'Fast Food',          sectorEtf:'XLY', inSPY:true, inQQQ:false, spyWeight:0.45 },
  { ticker:'NKE',  name:'Nike',               sector:'Consumer Discretionary', industry:'Footwear',           sectorEtf:'XLY', inSPY:true, inQQQ:false, spyWeight:0.25 },
  { ticker:'LOW',  name:"Lowe's",             sector:'Consumer Discretionary', industry:'Home Improvement',   sectorEtf:'XLY', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'SBUX', name:'Starbucks',          sector:'Consumer Discretionary', industry:'Coffee Retail',      sectorEtf:'XLY', inSPY:true, inQQQ:true,  spyWeight:0.22 },
  { ticker:'TJX',  name:'TJX Companies',      sector:'Consumer Discretionary', industry:'Off-Price Retail',   sectorEtf:'XLY', inSPY:true, inQQQ:false, spyWeight:0.38 },
  { ticker:'LULU', name:'Lululemon',           sector:'Consumer Discretionary', industry:'Athleisure',         sectorEtf:'XLY', inSPY:true, inQQQ:true,  spyWeight:0.15 },

  /* ══════════════════════════════════════════════════════
     COMMUNICATION SERVICES — XLC
  ══════════════════════════════════════════════════════ */
  { ticker:'GOOGL',name:'Alphabet Class A',   sector:'Communication Services', industry:'Internet Services',  sectorEtf:'XLC', inSPY:true, inQQQ:true,  spyWeight:2.10 },
  { ticker:'GOOG', name:'Alphabet Class C',   sector:'Communication Services', industry:'Internet Services',  sectorEtf:'XLC', inSPY:true, inQQQ:true,  spyWeight:1.80 },
  { ticker:'NFLX', name:'Netflix',            sector:'Communication Services', industry:'Streaming',          sectorEtf:'XLC', inSPY:true, inQQQ:true,  spyWeight:0.75 },
  { ticker:'DIS',  name:'Walt Disney',        sector:'Communication Services', industry:'Entertainment',       sectorEtf:'XLC', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'T',    name:'AT&T',               sector:'Communication Services', industry:'Telecom',            sectorEtf:'XLC', inSPY:true, inQQQ:false, spyWeight:0.35 },
  { ticker:'VZ',   name:'Verizon',            sector:'Communication Services', industry:'Telecom',            sectorEtf:'XLC', inSPY:true, inQQQ:false, spyWeight:0.30 },
  { ticker:'CHTR', name:'Charter Communications',sector:'Communication Services',industry:'Cable',            sectorEtf:'XLC', inSPY:true, inQQQ:true,  spyWeight:0.18 },
  { ticker:'SPOT', name:'Spotify',            sector:'Communication Services', industry:'Music Streaming',    sectorEtf:'XLC', inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'PINS', name:'Pinterest',          sector:'Communication Services', industry:'Social Media',       sectorEtf:'XLC', inSPY:false,inQQQ:false, spyWeight:0 },

  /* ══════════════════════════════════════════════════════
     CONSUMER STAPLES — XLP
  ══════════════════════════════════════════════════════ */
  { ticker:'PM',   name:'Philip Morris',      sector:'Consumer Staples', industry:'Tobacco',          sectorEtf:'XLP', inSPY:true, inQQQ:false, spyWeight:0.40 },
  { ticker:'MO',   name:'Altria',             sector:'Consumer Staples', industry:'Tobacco',          sectorEtf:'XLP', inSPY:true, inQQQ:false, spyWeight:0.22 },
  { ticker:'CL',   name:'Colgate-Palmolive',  sector:'Consumer Staples', industry:'Household Products',sectorEtf:'XLP', inSPY:true, inQQQ:false, spyWeight:0.20 },
  { ticker:'MDLZ', name:'Mondelez',           sector:'Consumer Staples', industry:'Snacks',           sectorEtf:'XLP', inSPY:true, inQQQ:true,  spyWeight:0.22 },
  { ticker:'EL',   name:"Estée Lauder",       sector:'Consumer Staples', industry:'Beauty',           sectorEtf:'XLP', inSPY:true, inQQQ:false, spyWeight:0.12 },

  /* ══════════════════════════════════════════════════════
     REAL ESTATE — XLRE (REIT profile)
  ══════════════════════════════════════════════════════ */
  { ticker:'CCI',  name:'Crown Castle',       sector:'Real Estate', industry:'Cell Tower REITs',     sectorEtf:'XLRE', inSPY:true, inQQQ:false, spyWeight:0.18 },
  { ticker:'PSA',  name:'Public Storage',     sector:'Real Estate', industry:'Storage REITs',        sectorEtf:'XLRE', inSPY:true, inQQQ:false, spyWeight:0.18 },
  { ticker:'WELL', name:'Welltower',          sector:'Real Estate', industry:'Healthcare REITs',     sectorEtf:'XLRE', inSPY:true, inQQQ:false, spyWeight:0.18 },
  { ticker:'SPG',  name:'Simon Property',     sector:'Real Estate', industry:'Retail REITs',         sectorEtf:'XLRE', inSPY:true, inQQQ:false, spyWeight:0.15 },
  { ticker:'DLR',  name:'Digital Realty',     sector:'Real Estate', industry:'Data Center REITs',    sectorEtf:'XLRE', inSPY:true, inQQQ:false, spyWeight:0.15 },
  { ticker:'O',    name:'Realty Income',      sector:'Real Estate', industry:'Net Lease REITs',      sectorEtf:'XLRE', inSPY:true, inQQQ:false, spyWeight:0.15 },
  { ticker:'CSGP', name:'CoStar Group',       sector:'Real Estate', industry:'Real Estate Data',     sectorEtf:'XLRE', inSPY:true, inQQQ:true,  spyWeight:0.12 },

  /* ══════════════════════════════════════════════════════
     ENERGY — XLE (oil & gas, not utilities)
  ══════════════════════════════════════════════════════ */
  { ticker:'SLB',  name:'SLB',                sector:'Energy', industry:'Oilfield Services',        sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.22 },
  { ticker:'MPC',  name:'Marathon Petroleum', sector:'Energy', industry:'Refining',                 sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.22 },
  { ticker:'VLO',  name:'Valero Energy',      sector:'Energy', industry:'Refining',                 sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.20 },
  { ticker:'PSX',  name:'Phillips 66',        sector:'Energy', industry:'Refining',                 sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.18 },
  { ticker:'HAL',  name:'Halliburton',        sector:'Energy', industry:'Oilfield Services',        sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.15 },
  { ticker:'OXY',  name:'Occidental',         sector:'Energy', industry:'Oil & Gas',               sectorEtf:'XLE', inSPY:true, inQQQ:false, spyWeight:0.18 },

  /* ══════════════════════════════════════════════════════
     MATERIALS — XLB
  ══════════════════════════════════════════════════════ */
  { ticker:'SHW',  name:'Sherwin-Williams',   sector:'Materials', industry:'Paints & Coatings',    sectorEtf:'XLB', inSPY:true, inQQQ:false, spyWeight:0.28 },
  { ticker:'NEM',  name:'Newmont',            sector:'Materials', industry:'Gold Mining',           sectorEtf:'XLB', inSPY:true, inQQQ:false, spyWeight:0.15 },
  { ticker:'NUE',  name:'Nucor',              sector:'Materials', industry:'Steel',                 sectorEtf:'XLB', inSPY:true, inQQQ:false, spyWeight:0.12 },
  { ticker:'ALB',  name:'Albemarle',          sector:'Materials', industry:'Lithium',               sectorEtf:'XLB', inSPY:true, inQQQ:false, spyWeight:0.10 },
  { ticker:'DD',   name:'DuPont',             sector:'Materials', industry:'Specialty Chemicals',   sectorEtf:'XLB', inSPY:true, inQQQ:false, spyWeight:0.12 },
  { ticker:'PPG',  name:'PPG Industries',     sector:'Materials', industry:'Coatings',              sectorEtf:'XLB', inSPY:true, inQQQ:false, spyWeight:0.10 },
  { ticker:'VMC',  name:'Vulcan Materials',   sector:'Materials', industry:'Construction Materials',sectorEtf:'XLB', inSPY:true, inQQQ:false, spyWeight:0.12 },

  /* ══════════════════════════════════════════════════════
     AI / DATA (cross-sector, high conviction watchlist)
  ══════════════════════════════════════════════════════ */
  { ticker:'CRWD', name:'CrowdStrike',        sector:'Information Technology', industry:'Cybersecurity',       sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.30 },
  { ticker:'PANW', name:'Palo Alto Networks', sector:'Information Technology', industry:'Cybersecurity',       sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.35 },
  { ticker:'TTD',  name:'The Trade Desk',     sector:'Communication Services', industry:'Ad-Tech',             sectorEtf:'XLC', inSPY:false,inQQQ:true,  spyWeight:0 },
  { ticker:'PATH', name:'UiPath',             sector:'Information Technology', industry:'RPA/AI',              sectorEtf:'XLK', inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'AI',   name:'C3.ai',              sector:'Information Technology', industry:'AI Software',         sectorEtf:'XLK', inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'GTLB', name:'GitLab',             sector:'Information Technology', industry:'DevOps',              sectorEtf:'XLK', inSPY:false,inQQQ:false, spyWeight:0 },


  /* ══════════════════════════════════════════════════════
     HEALTH CARE LARGE CAP — XLV
  ══════════════════════════════════════════════════════ */
  { ticker:'LLY',  name:'Eli Lilly',             sector:'Health Care', industry:'Pharmaceuticals',    sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:1.80 },
  { ticker:'UNH',  name:'UnitedHealth',           sector:'Health Care', industry:'Health Insurance',   sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:1.30 },
  { ticker:'ABBV', name:'AbbVie',                 sector:'Health Care', industry:'Pharmaceuticals',    sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.70 },
  { ticker:'MRK',  name:'Merck',                  sector:'Health Care', industry:'Pharmaceuticals',    sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.55 },
  { ticker:'AMGN', name:'Amgen',                  sector:'Health Care', industry:'Biotech',            sectorEtf:'XLV', inSPY:true, inQQQ:true,  spyWeight:0.40 },
  { ticker:'GILD', name:'Gilead Sciences',        sector:'Health Care', industry:'Biotech',            sectorEtf:'XLV', inSPY:true, inQQQ:true,  spyWeight:0.30 },
  { ticker:'REGN', name:'Regeneron',              sector:'Health Care', industry:'Biotech',            sectorEtf:'XLV', inSPY:true, inQQQ:true,  spyWeight:0.28 },
  { ticker:'ABT',  name:'Abbott Laboratories',    sector:'Health Care', industry:'Medical Devices',    sectorEtf:'XLV', inSPY:true, inQQQ:false, spyWeight:0.50 },

  /* ══════════════════════════════════════════════════════
     SEMICONDUCTORS — EQUIPMENT (XLK)
  ══════════════════════════════════════════════════════ */
  { ticker:'MCHP', name:'Microchip Technology',   sector:'Information Technology', industry:'Semiconductors',         sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.20 },
  { ticker:'ON',   name:'ON Semiconductor',       sector:'Information Technology', industry:'Semiconductors',         sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.15 },
  { ticker:'MPWR', name:'Monolithic Power',       sector:'Information Technology', industry:'Semiconductors',         sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.15 },
  { ticker:'SWKS', name:'Skyworks Solutions',     sector:'Information Technology', industry:'Semiconductors',         sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.10 },
  { ticker:'WOLF', name:'Wolfspeed',              sector:'Information Technology', industry:'Semiconductors',         sectorEtf:'XLK', inSPY:false,inQQQ:false, spyWeight:0 },

  /* ══════════════════════════════════════════════════════
     SOFTWARE — ENTERPRISE
  ══════════════════════════════════════════════════════ */
  { ticker:'ORCL', name:'Oracle',                 sector:'Information Technology', industry:'Software',               sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.80 },
  { ticker:'INTU', name:'Intuit',                 sector:'Information Technology', industry:'Software',               sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.45 },
  { ticker:'WDAY', name:'Workday',                sector:'Information Technology', industry:'Software',               sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.20 },
  { ticker:'SAP',  name:'SAP SE',                 sector:'Information Technology', industry:'Software',               sectorEtf:'XLK', inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'HUBS', name:'HubSpot',                sector:'Information Technology', industry:'Software',               sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:0.12 },
  { ticker:'BILL', name:'Bill Holdings',          sector:'Information Technology', industry:'Software',               sectorEtf:'XLK', inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'MDB',  name:'MongoDB',                sector:'Information Technology', industry:'Database Software',      sectorEtf:'XLK', inSPY:false,inQQQ:true,  spyWeight:0 },
  { ticker:'CFLT', name:'Confluent',              sector:'Information Technology', industry:'Data Streaming',         sectorEtf:'XLK', inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'TYL',  name:'Tyler Technologies',     sector:'Information Technology', industry:'Gov Software',           sectorEtf:'XLK', inSPY:true, inQQQ:false, spyWeight:0.10 },

  /* ══════════════════════════════════════════════════════
     CONSUMER TECH / PLATFORMS
  ══════════════════════════════════════════════════════ */
  { ticker:'AAPL', name:'Apple',                  sector:'Information Technology', industry:'Technology Hardware',    sectorEtf:'XLK', inSPY:true, inQQQ:true,  spyWeight:7.10 },
  { ticker:'SHOP', name:'Shopify',                sector:'Consumer Discretionary', industry:'E-Commerce Infra',      sectorEtf:'XLY', inSPY:false,inQQQ:true,  spyWeight:0 },
  { ticker:'GRAB', name:'Grab Holdings',          sector:'Consumer Discretionary', industry:'Super App SEA',         sectorEtf:'XLY', inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'DASH', name:'DoorDash',               sector:'Consumer Discretionary', industry:'Food Delivery',         sectorEtf:'XLY', inSPY:true, inQQQ:false, spyWeight:0.12 },
  { ticker:'ABNB', name:'Airbnb',                 sector:'Consumer Discretionary', industry:'Travel Platform',       sectorEtf:'XLY', inSPY:true, inQQQ:true,  spyWeight:0.18 },
  { ticker:'LYFT', name:'Lyft',                   sector:'Consumer Discretionary', industry:'Ride-Sharing',          sectorEtf:'XLY', inSPY:false,inQQQ:false, spyWeight:0 },

  /* ══════════════════════════════════════════════════════
     BANKS — REGIONAL & MID-CAP
  ══════════════════════════════════════════════════════ */
  { ticker:'WFC',  name:'Wells Fargo',            sector:'Financials', industry:'Banks',                             sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.50 },
  { ticker:'C',    name:'Citigroup',              sector:'Financials', industry:'Banks',                             sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.30 },
  { ticker:'USB',  name:'U.S. Bancorp',           sector:'Financials', industry:'Banks',                             sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.20 },
  { ticker:'TFC',  name:'Truist Financial',       sector:'Financials', industry:'Banks',                             sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.15 },
  { ticker:'RF',   name:'Regions Financial',      sector:'Financials', industry:'Banks',                             sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.10 },
  { ticker:'FITB', name:'Fifth Third Bancorp',    sector:'Financials', industry:'Banks',                             sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.10 },
  { ticker:'CFG',  name:'Citizens Financial',     sector:'Financials', industry:'Banks',                             sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.08 },
  { ticker:'KEY',  name:'KeyCorp',                sector:'Financials', industry:'Banks',                             sectorEtf:'XLF', inSPY:true, inQQQ:false, spyWeight:0.08 },

  /* ══════════════════════════════════════════════════════
     BENCHMARKS & ETFs — not in SPY/QQQ sector ETFs
  ══════════════════════════════════════════════════════ */
  { ticker:'SPY',  name:'S&P 500 ETF',           sector:'Benchmark', industry:'Index ETF',   sectorEtf:'',    inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'QQQ',  name:'Nasdaq 100 ETF',        sector:'Benchmark', industry:'Index ETF',   sectorEtf:'',    inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'IWM',  name:'Russell 2000 ETF',      sector:'Benchmark', industry:'Index ETF',   sectorEtf:'',    inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'XLK',  name:'Technology Sector ETF', sector:'Benchmark', industry:'Sector ETF',  sectorEtf:'',    inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'XLV',  name:'Health Care ETF',       sector:'Benchmark', industry:'Sector ETF',  sectorEtf:'',    inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'XLF',  name:'Financials ETF',        sector:'Benchmark', industry:'Sector ETF',  sectorEtf:'',    inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'XLY',  name:'Consumer Discr. ETF',   sector:'Benchmark', industry:'Sector ETF',  sectorEtf:'',    inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'XLE',  name:'Energy ETF',            sector:'Benchmark', industry:'Sector ETF',  sectorEtf:'',    inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'XLI',  name:'Industrials ETF',       sector:'Benchmark', industry:'Sector ETF',  sectorEtf:'',    inSPY:false,inQQQ:false, spyWeight:0 },
  { ticker:'ARKK', name:'ARK Innovation ETF',    sector:'Benchmark', industry:'Active ETF',  sectorEtf:'',    inSPY:false,inQQQ:false, spyWeight:0 },
]

/* ══════════════════════════════════════════════════════════
   QUERY HELPERS
══════════════════════════════════════════════════════════ */

/** All unique sector names */
export const SECTORS = [...new Set(UNIVERSE.map(t => t.sector))]

/** All unique industry names */
export const INDUSTRIES = [...new Set(UNIVERSE.map(t => t.industry))]

/** SPY components only, sorted by weight descending */
export const SPY_UNIVERSE = UNIVERSE
  .filter(t => t.inSPY)
  .sort((a, b) => b.spyWeight - a.spyWeight)

/** QQQ components only */
export const QQQ_UNIVERSE = UNIVERSE.filter(t => t.inQQQ)

/** In QQQ but NOT in SPY (unique QQQ names to add value vs SPY) */
export const QQQ_ONLY = UNIVERSE.filter(t => t.inQQQ && !t.inSPY)

/** Find a ticker's metadata */
export function getTicker(ticker) {
  return UNIVERSE.find(t => t.ticker === ticker.toUpperCase()) || null
}

/** Get all peers in the same sector (excluding the ticker itself) */
export function getSectorPeers(ticker) {
  const t = getTicker(ticker)
  if (!t) return []
  return UNIVERSE.filter(u => u.sector === t.sector && u.ticker !== ticker)
}

/** Get all peers in the same industry (tighter comparison) */
export function getIndustryPeers(ticker) {
  const t = getTicker(ticker)
  if (!t) return []
  return UNIVERSE.filter(u => u.industry === t.industry && u.ticker !== ticker)
}

/** Get all tickers in a sector */
export function getBySector(sector) {
  return UNIVERSE.filter(t => t.sector === sector)
}

/** Get all tickers in an industry */
export function getByIndustry(industry) {
  return UNIVERSE.filter(t => t.industry === industry)
}
