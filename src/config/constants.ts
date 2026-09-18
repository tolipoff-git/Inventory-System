import { ToolClass, ToolGroup } from '../types/inventory';
import { UserRole } from '../types/personnel';

// Injected by Vite from `package.json` (see `vite.config.ts` `define`).
// Declared here so `tsc` is happy; the `typeof` guard keeps this safe when the
// constant is not substituted (e.g. a bare `tsc`/node run).
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'v0';
export const BUILD_DATE = '2026-09-10';
export const SCHEMA_VERSION = 4;
export const CAL_WARNING_DAYS = 14;
export const WEAR_RETIRE_PCT = 75;
export const WEAR_WARN_PCT = 50;
export const AUDIT_LOG_LIMIT = 1000;
export const SCAN_KEY_TIMEOUT_MS = 50;
export const DAY_MS = 86400000;

export const DEFAULT_SYNC_ROOM = 'INV-MAIN';
export const DEFAULT_SYNC_SECRET = (typeof process !== 'undefined' && (process as any).env?.SYNC_SECRET) ? (process as any).env.SYNC_SECRET : (typeof (globalThis as any).SYNC_SECRET !== 'undefined' ? (globalThis as any).SYNC_SECRET : '');

export const ROLES: Record<UserRole, number> = {
  'Administrator': 3,
  'Tool Crib Manager': 2,
  'Operator': 1,
};

export const STATUS_COLORS: Record<string, string> = {
  'Active': 'var(--success)',
  'Issued': 'var(--primary)',
  'Backup': '#8c929a',
  'Maintenance': 'var(--warning)',
  'Overdue': 'var(--danger)',
};

export const TOOL_CLASSES: ToolClass[] = [
  { p: 'TW', group: 'MECH', en: 'Torque Wrench', ru: 'Динамометрический ключ', cat: 'Hand Tools' },
  { p: 'PD', group: 'MECH', en: 'Power Driver / Impact Wrench', ru: 'Шуруповёрт / гайковёрт', cat: 'Power Tools' },
  { p: 'BW', group: 'MECH', en: 'Box Wrench Set', ru: 'Набор комбинированных ключей', cat: 'Hand Tools' },
  { p: 'SK', group: 'MECH', en: 'Socket & Ratchet Set', ru: 'Головки и трещотки', cat: 'Hand Tools' },
  { p: 'HT', group: 'MECH', en: 'Hand Tool (general)', ru: 'Слесарный инструмент', cat: 'Hand Tools' },
  { p: 'CL', group: 'MECH', en: 'Clamp & Fixture', ru: 'Струбцины и приспособления', cat: 'Fixtures' },
  { p: 'PN', group: 'MECH', en: 'Pneumatic Tool', ru: 'Пневмоинструмент', cat: 'Power Tools' },
  { p: 'VT', group: 'EL', en: 'VDE Insulated Tool 1000V', ru: 'Диэлектрический инструмент 1000V', cat: 'Electrical' },
  { p: 'CT', group: 'EL', en: 'Crimping Tool', ru: 'Обжимной инструмент (пресс-клещи)', cat: 'Electrical' },
  { p: 'WS', group: 'EL', en: 'Wire Stripper', ru: 'Стриппер / съёмник изоляции', cat: 'Electrical' },
  { p: 'MC', group: 'EL', en: 'Panel Cutter (DIN rail / duct)', ru: 'Резка DIN-рейки и кабель-каналов', cat: 'Electrical' },
  { p: 'DC', group: 'EL', en: 'Meter & Diagnostics', ru: 'Измеритель и диагностика', cat: 'Electrical' },
  { p: 'CB', group: 'EL', en: 'Cable & Wire Tool', ru: 'Кабельный инструмент', cat: 'Electrical' },
  { p: 'TM', group: 'MEAS', en: 'Tape Measure', ru: 'Рулетка', cat: 'Measurement' },
  { p: 'CA', group: 'MEAS', en: 'Caliper / Micrometer', ru: 'Штангенинструмент / микрометр', cat: 'Measurement' },
  { p: 'GA', group: 'MEAS', en: 'Gauge / Template', ru: 'Калибры и шаблоны', cat: 'Measurement' },
  { p: 'BT', group: 'CONS', en: 'Battery Pack', ru: 'Аккумуляторная батарея', cat: 'Power' },
  { p: 'PB', group: 'CONS', en: 'Power Bits & Inserts', ru: 'Биты и насадки', cat: 'Power Accessories' },
  { p: 'DR', group: 'CONS', en: 'Drills & Taps', ru: 'Свёрла и метчики', cat: 'Cutting Tools' },
  { p: 'AB', group: 'CONS', en: 'Abrasives', ru: 'Абразивные материалы', cat: 'Cutting Tools' },
  { p: 'CN', group: 'CONS', en: 'General Consumable', ru: 'Прочая расходка', cat: 'Consumables' },
];

export const TOOL_CLASS_GROUPS: Record<string, ToolGroup> = {
  MECH: { en: 'Mechanical Assembly', ru: 'Механическая сборка' },
  EL: { en: 'Electrical Assembly 24V/480V', ru: 'Электросборка 24V / 480V' },
  MEAS: { en: 'Measurement & Inspection', ru: 'Измерение и контроль' },
  CONS: { en: 'Consumables', ru: 'Расходные материалы' },
};

export const SHAREPOINT_EXPENSE_URL = 'https://company-my.sharepoint.com/';
export const QR_BASE_URL = 'https://inventory-system.tolipoff.workers.dev';

export const PERMANENT_PREFIXES = TOOL_CLASSES.filter(c => c.group !== 'CONS').map(c => c.p);
export const CONSUMABLE_PREFIXES = TOOL_CLASSES.filter(c => c.group === 'CONS').map(c => c.p);

/**
 * Tool classes that require periodic verification / calibration. Drives whether the
 * "Record Calibration" action is offered on a tool card — a socket head, a hammer or
 * a wrench set does not need a calibration tag.
 *
 * TW  Torque Wrench · CT Crimping Tool · DC Meter & Diagnostics (multimeter) ·
 * CA  Caliper / Micrometer · GA Gauge / Template.
 * Add a prefix here to enable verification for another class (e.g. `TM` tape measures).
 */
export const CALIBRATION_PREFIXES = ['TW', 'CT', 'DC', 'CA', 'GA'];

export interface RubricDefinition {
  id: string;
  key: string;
  en: string[];
  ru: string[];
}

export const S5_RUBRICS: RubricDefinition[] = [
  {
    id: 'sort',
    key: 'Sort',
    en: [
      'Needed and unneeded items are mixed; clutter everywhere',
      'Unneeded items on the floor and surfaces',
      'Unneeded items exist but are set aside separately',
      'Unneeded items are red-tagged and moved to quarantine',
      'Only what is needed — nothing extra',
    ],
    ru: [
      'Нужное перемешано с ненужным, лишнее повсюду',
      'Лишние предметы на полу и поверхностях',
      'Лишнее есть, но сложено отдельно',
      'Лишнее промаркировано и выведено в зону карантина',
      'Только нужное — ничего лишнего',
    ],
  },
  {
    id: 'setOrder',
    key: 'Set in Order',
    en: [
      'Tools lie anywhere; no designated places',
      'Places exist but are not labeled',
      'Places are labeled; some tools out of place',
      'Everything in place; minor marking flaws',
      'Everything in its place; addresses and shadow boards match',
    ],
    ru: [
      'Инструмент лежит где попало, мест нет',
      'Места есть, но не подписаны',
      'Места подписаны, часть инструмента не на местах',
      'Всё на местах, мелкие нарушения разметки',
      'Всё на своих местах, адреса и теневые контуры совпадают',
    ],
  },
  {
    id: 'shine',
    key: 'Shine',
    en: [
      'Trash everywhere: packaging, bags, dust on tables, dirty tools',
      'Only trash on the floor',
      'Only small debris on ~30% of the area',
      'Only dust',
      'Clean',
    ],
    ru: [
      'Везде мусор: упаковки, пакеты, пыль на столах, инструмент грязный',
      'Только мусор на полу',
      'Только мелкий мусор на ~30% площади',
      'Только пыль',
      'Чисто',
    ],
  },
  {
    id: 'standardize',
    key: 'Standardize',
    en: [
      'No standards, no labeling',
      'Standards exist but are ignored',
      'Standards partially followed (~30% deviations)',
      'Standards followed; rare deviations',
      'Standards followed by all; checklists in use',
    ],
    ru: [
      'Нет стандартов и маркировки',
      'Стандарты есть, но не соблюдаются',
      'Стандарты соблюдаются частично (~30% отклонений)',
      'Стандарты соблюдаются, единичные отклонения',
      'Стандарты соблюдаются всеми, ведутся чек-листы',
    ],
  },
  {
    id: 'sustain',
    key: 'Sustain',
    en: [
      'No audits; violations repeat',
      'Rare audits; fixes are not tracked',
      'Regular audits; fixes are delayed',
      'Violations are fixed on time',
      'Improvements are sustained; the team maintains itself',
    ],
    ru: [
      'Аудитов нет, нарушения повторяются',
      'Аудиты редко, исправления не отслеживаются',
      'Аудиты регулярны, но устранение затягивается',
      'Нарушения устраняются в срок',
      'Улучшения устойчивы, команда поддерживает порядок сама',
    ],
  },
];

export const CONFIG = {
  APP_VERSION,
  BUILD_DATE,
  SCHEMA_VERSION,
  CAL_WARNING_DAYS,
  WEAR_RETIRE_PCT,
  WEAR_WARN_PCT,
  AUDIT_LOG_LIMIT,
  SCAN_KEY_TIMEOUT_MS,
  DAY_MS,
  DEFAULT_SYNC_ROOM,
  DEFAULT_SYNC_SECRET,
  ROLES,
  STATUS_COLORS,
  TOOL_CLASSES,
  TOOL_CLASS_GROUPS,
  CALIBRATION_PREFIXES,
  SHAREPOINT_EXPENSE_URL,
  QR_BASE_URL,
  PERMANENT_PREFIXES,
  CONSUMABLE_PREFIXES,
  S5_RUBRICS,
};
