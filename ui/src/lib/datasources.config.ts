/** Datasource configuration: maps each source system to the files it can supply,
 *  and each file to its tables. Single source of truth — no component hard-codes
 *  this mapping. Tables not covered by the listed systems are marked origin:
 *  'manual' (external/manual ingestion). */

/** A table within a file datasource. */
export interface DatasourceTable {
  name: string
  origin: string // 'system' | 'manual'
  rows?: number
}

/** A file/datasource that a system can supply. */
export interface DatasourceFile {
  key: string          // e.g. '01_Sales_History'
  name: string
  description: string
  systems: string[]    // system keys that can feed this file
  tables: DatasourceTable[]
}

/** A source system in the catalog. */
export interface SourceSystem {
  key: string          // sap-sd | sap-mm | sap-ibp | sap-mdg | nielseniq | sap-ariba
  name: string
  description: string
  protocol: 'odata' | 'rest' | 'feed'
  files: string[]      // file keys this system can supply
  requiredFields: ConnectionField[]
  monogram: string     // 2-letter fallback when no logo
  color: string        // brand colour hex
}

export interface ConnectionField {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'password' | 'checkbox'
  placeholder?: string
  options?: { value: string; label: string }[]
  default?: string | boolean
  sapOnly?: boolean    // only shown for SAP systems
  nielseniqOnly?: boolean
  aribaOnly?: boolean
}

/** Connection schedule options. */
export interface ScheduleOptions {
  frequency: 'hourly' | 'daily' | 'weekly' | 'manual'
  time?: string        // HH:mm for daily
  dayOfWeek?: number   // 0-6 for weekly
  backfillStart: string // YYYY-MM-DD
  incrementalKey: string
}

// ---------------------------------------------------------------------------
// Systems catalogue
// ---------------------------------------------------------------------------

export const SOURCE_SYSTEMS: SourceSystem[] = [
  {
    key: 'sap-sd',
    name: 'SAP SD',
    description: 'Billing and order extracts, sales MIS',
    protocol: 'odata',
    files: ['01_Sales_History'],
    monogram: 'SD',
    color: '#00656E',
    requiredFields: [
      { key: 'base_url', label: 'Base URL', type: 'text', placeholder: 'https://sap-sd.example.com' },
      { key: 'environment', label: 'Environment', type: 'select', default: 'QA',
        options: [{ value: 'Dev', label: 'Dev' }, { value: 'QA', label: 'QA' }, { value: 'Prod', label: 'Prod' }] },
      { key: 'auth_type', label: 'Auth type', type: 'select', default: 'oauth2',
        options: [
          { value: 'oauth2', label: 'OAuth2 client credentials' },
          { value: 'basic', label: 'Basic technical user' },
          { value: 'apikey', label: 'API key' },
          { value: 'cloud_connector', label: 'SAP Cloud Connector' },
        ] },
      { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'sb-...' },
      { key: 'client_secret', label: 'Client secret', type: 'password', placeholder: '••••••••' },
      { key: 'sap_client', label: 'SAP client number', type: 'text', placeholder: '100', sapOnly: true },
      { key: 'service_path', label: 'OData service path', type: 'text', placeholder: '/sap/opu/odata/sapi/', sapOnly: true },
      { key: 'incremental_key', label: 'Incremental key', type: 'text', default: 'Week_Start', placeholder: 'Week_Start' },
      { key: 'backfill_start', label: 'Backfill start date', type: 'text', default: '2022-04-01', placeholder: 'YYYY-MM-DD' },
    ],
  },
  {
    key: 'sap-mm',
    name: 'SAP MM',
    description: 'Stock reports, stock transfer orders, POs and goods receipts',
    protocol: 'odata',
    files: ['02_Inventory_and_Service', '05_Supply_Procurement_RawMaterial'],
    monogram: 'MM',
    color: '#00656E',
    requiredFields: [
      { key: 'base_url', label: 'Base URL', type: 'text', placeholder: 'https://sap-mm.example.com' },
      { key: 'environment', label: 'Environment', type: 'select', default: 'QA',
        options: [{ value: 'Dev', label: 'Dev' }, { value: 'QA', label: 'QA' }, { value: 'Prod', label: 'Prod' }] },
      { key: 'auth_type', label: 'Auth type', type: 'select', default: 'oauth2',
        options: [
          { value: 'oauth2', label: 'OAuth2 client credentials' },
          { value: 'basic', label: 'Basic technical user' },
          { value: 'apikey', label: 'API key' },
          { value: 'cloud_connector', label: 'SAP Cloud Connector' },
        ] },
      { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'sb-...' },
      { key: 'client_secret', label: 'Client secret', type: 'password', placeholder: '••••••••' },
      { key: 'sap_client', label: 'SAP client number', type: 'text', placeholder: '100', sapOnly: true },
      { key: 'service_path', label: 'OData service path', type: 'text', placeholder: '/sap/opu/odata/sapi/', sapOnly: true },
      { key: 'incremental_key', label: 'Incremental key', type: 'text', default: 'Week_Start', placeholder: 'Week_Start' },
      { key: 'backfill_start', label: 'Backfill start date', type: 'text', default: '2022-04-01', placeholder: 'YYYY-MM-DD' },
    ],
  },
  {
    key: 'sap-ibp',
    name: 'SAP IBP',
    description: 'Forecast archives and actuals (Demand Planning)',
    protocol: 'odata',
    files: ['03_Forecast_Versions'],
    monogram: 'IBP',
    color: '#00656E',
    requiredFields: [
      { key: 'base_url', label: 'Base URL', type: 'text', placeholder: 'https://sap-ibp.example.com' },
      { key: 'environment', label: 'Environment', type: 'select', default: 'QA',
        options: [{ value: 'Dev', label: 'Dev' }, { value: 'QA', label: 'QA' }, { value: 'Prod', label: 'Prod' }] },
      { key: 'auth_type', label: 'Auth type', type: 'select', default: 'oauth2',
        options: [
          { value: 'oauth2', label: 'OAuth2 client credentials' },
          { value: 'basic', label: 'Basic technical user' },
          { value: 'apikey', label: 'API key' },
          { value: 'cloud_connector', label: 'SAP Cloud Connector' },
        ] },
      { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'sb-...' },
      { key: 'client_secret', label: 'Client secret', type: 'password', placeholder: '••••••••' },
      { key: 'sap_client', label: 'SAP client number', type: 'text', placeholder: '100', sapOnly: true },
      { key: 'service_path', label: 'OData service path', type: 'text', placeholder: '/sap/opu/odata/sapi/', sapOnly: true },
      { key: 'incremental_key', label: 'Incremental key', type: 'text', default: 'Week_Start', placeholder: 'Week_Start' },
      { key: 'backfill_start', label: 'Backfill start date', type: 'text', default: '2022-04-01', placeholder: 'YYYY-MM-DD' },
    ],
  },
  {
    key: 'sap-mdg',
    name: 'SAP MDG',
    description: 'SKU and location masters',
    protocol: 'odata',
    files: ['04_Masters_Market_Weather_Events'],
    monogram: 'MDG',
    color: '#00656E',
    requiredFields: [
      { key: 'base_url', label: 'Base URL', type: 'text', placeholder: 'https://sap-mdg.example.com' },
      { key: 'environment', label: 'Environment', type: 'select', default: 'QA',
        options: [{ value: 'Dev', label: 'Dev' }, { value: 'QA', label: 'QA' }, { value: 'Prod', label: 'Prod' }] },
      { key: 'auth_type', label: 'Auth type', type: 'select', default: 'oauth2',
        options: [
          { value: 'oauth2', label: 'OAuth2 client credentials' },
          { value: 'basic', label: 'Basic technical user' },
          { value: 'apikey', label: 'API key' },
          { value: 'cloud_connector', label: 'SAP Cloud Connector' },
        ] },
      { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'sb-...' },
      { key: 'client_secret', label: 'Client secret', type: 'password', placeholder: '••••••••' },
      { key: 'sap_client', label: 'SAP client number', type: 'text', placeholder: '100', sapOnly: true },
      { key: 'service_path', label: 'OData service path', type: 'text', placeholder: '/sap/opu/odata/sapi/', sapOnly: true },
      { key: 'incremental_key', label: 'Incremental key', type: 'text', default: 'Week_Start', placeholder: 'Week_Start' },
      { key: 'backfill_start', label: 'Backfill start date', type: 'text', default: '2022-04-01', placeholder: 'YYYY-MM-DD' },
    ],
  },
  {
    key: 'nielseniq',
    name: 'NielsenIQ',
    description: 'Market retail audit, market and weather events',
    protocol: 'feed',
    files: ['04_Masters_Market_Weather_Events'],
    monogram: 'NIQ',
    color: '#00A3E0',
    requiredFields: [
      { key: 'base_url', label: 'Feed endpoint URL', type: 'text', placeholder: 'https://api.nielseniq.com/feeds' },
      { key: 'api_key', label: 'API key', type: 'password', placeholder: '••••••••', nielseniqOnly: true },
      { key: 'feed_id', label: 'Feed ID', type: 'text', placeholder: 'niq-feed-...', nielseniqOnly: true },
      { key: 'incremental_key', label: 'Incremental key', type: 'text', default: 'Week_Start', placeholder: 'Week_Start' },
      { key: 'backfill_start', label: 'Backfill start date', type: 'text', default: '2022-04-01', placeholder: 'YYYY-MM-DD' },
    ],
  },
  {
    key: 'sap-ariba',
    name: 'SAP Ariba',
    description: 'Purchase orders, goods receipts, supplier planning',
    protocol: 'rest',
    files: ['05_Supply_Procurement_RawMaterial'],
    monogram: 'AR',
    color: '#00656E',
    requiredFields: [
      { key: 'base_url', label: 'Base URL', type: 'text', placeholder: 'https://sap-ariba.example.com' },
      { key: 'environment', label: 'Environment', type: 'select', default: 'QA',
        options: [{ value: 'Dev', label: 'Dev' }, { value: 'QA', label: 'QA' }, { value: 'Prod', label: 'Prod' }] },
      { key: 'auth_type', label: 'Auth type', type: 'select', default: 'oauth2',
        options: [
          { value: 'oauth2', label: 'OAuth2 client credentials' },
          { value: 'basic', label: 'Basic technical user' },
          { value: 'apikey', label: 'API key' },
        ] },
      { key: 'client_id', label: 'Client ID', type: 'text', placeholder: 'sb-...' },
      { key: 'client_secret', label: 'Client secret', type: 'password', placeholder: '••••••••' },
      { key: 'incremental_key', label: 'Incremental key', type: 'text', default: 'Week_Start', placeholder: 'Week_Start' },
      { key: 'backfill_start', label: 'Backfill start date', type: 'text', default: '2022-04-01', placeholder: 'YYYY-MM-DD' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Files: key → name, description, systems, tables
// ---------------------------------------------------------------------------

const MANUAL_TABLES_4 = [
  'Weather_Weekly', 'Monsoon_Onset', 'Weather_Stations', 'Festival_Calendar',
  'Lighting_Seasonality', 'Festival_Week_Index', 'Trade_Schemes', 'Event_Log',
  'Scenario_Levers', 'Scenarios', 'DarkStore_Partner_Weekly', 'DarkStore_Onboarding',
]

const MANUAL_TABLES_5 = [
  'Commodity_Drivers', 'Freight_Rates_Monthly', 'Trade_Customs_Events',
  'Capacity_Monthly', 'BOM',
]

export const DATASOURCE_FILES: DatasourceFile[] = [
  {
    key: '01_Sales_History',
    name: 'Sales History',
    description: 'Billing and order extracts, sales MIS',
    systems: ['sap-sd'],
    tables: Array.from({ length: 15 }, (_, i) => ({
      name: `Sales_Table_${i + 1}`,
      origin: 'system',
      rows: 150000 + i * 10000,
    })),
  },
  {
    key: '02_Inventory_and_Service',
    name: 'Inventory and Service',
    description: 'Stock reports, stock transfer orders',
    systems: ['sap-mm'],
    tables: Array.from({ length: 8 }, (_, i) => ({
      name: `Inventory_Table_${i + 1}`,
      origin: 'system',
      rows: 80000 + i * 5000,
    })),
  },
  {
    key: '03_Forecast_Versions',
    name: 'Forecast Versions',
    description: 'Forecast archives and actuals',
    systems: ['sap-ibp'],
    tables: Array.from({ length: 3 }, (_, i) => ({
      name: `Forecast_Table_${i + 1}`,
      origin: 'system',
      rows: 45000 + i * 3000,
    })),
  },
  {
    key: '04_Masters_Market_Weather_Events',
    name: 'Masters, Market, Weather, Events',
    description: 'SKU/location masters, market retail audit, weather and festival events',
    systems: ['sap-mdg', 'nielseniq'],
    tables: [
      ...Array.from({ length: 15 }, (_, i) => ({
        name: `Master_Table_${i + 1}`,
        origin: 'system',
        rows: 30000 + i * 2000,
      })),
      ...MANUAL_TABLES_4.map((name) => ({ name, origin: 'manual' as const })),
    ],
  },
  {
    key: '05_Supply_Procurement_RawMaterial',
    name: 'Supply, Procurement, Raw Material',
    description: 'POs, goods receipts, plant and supplier planning',
    systems: ['sap-mm', 'sap-ariba'],
    tables: [
      ...Array.from({ length: 17 }, (_, i) => ({
        name: `Supply_Table_${i + 1}`,
        origin: 'system',
        rows: 60000 + i * 4000,
      })),
      ...MANUAL_TABLES_5.map((name) => ({ name, origin: 'manual' as const })),
    ],
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getSystem(key: string): SourceSystem | undefined {
  return SOURCE_SYSTEMS.find((s) => s.key === key)
}

export function getFile(key: string): DatasourceFile | undefined {
  return DATASOURCE_FILES.find((f) => f.key === key)
}

export function getFilesForSystem(systemKey: string): DatasourceFile[] {
  return DATASOURCE_FILES.filter((f) => f.systems.includes(systemKey))
}

export function getSystemsForFile(fileKey: string): SourceSystem[] {
  const file = getFile(fileKey)
  if (!file) return []
  return SOURCE_SYSTEMS.filter((s) => file.systems.includes(s.key))
}

// Tables marked manual for each file
export const MANUAL_TABLE_NAMES: Record<string, string[]> = {
  '04_Masters_Market_Weather_Events': MANUAL_TABLES_4,
  '05_Supply_Procurement_RawMaterial': MANUAL_TABLES_5,
}
