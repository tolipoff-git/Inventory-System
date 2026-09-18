// ============================================================================
// Seed standards — the four SOPs that used to be hardcoded in `SopModal`.
//
// They are seeded once into `settings.sops` and are then ordinary editable data:
// the shop can reword them, add revisions and add new documents. Seeding only
// happens while the stored list is empty, so an edited or obsoleted document is
// never overwritten.
// ============================================================================

import { SopDocument } from '../types/sop';

export const SEED_SOPS: SopDocument[] = [
  {
    id: 'SOP-GEN-00',
    titleEn: '5S Tool Handling & Shadow Board Standards',
    titleRu: 'Обращение с инструментом по 5S и стандарты теневых досок',
    bodyEn: `
      <h4>1. Standard 5S Tool Control</h4>
      <p>Every tool in the facility has a designated home labeled with its unique Tool ID, shadow board silhouette, and address coordinates.</p>
      <h4>2. Checkout &amp; Cleanliness</h4>
      <p>Tools must be checked out prior to work shift start and returned clean and wiped down before end-of-shift muster.</p>
    `,
    bodyRu: `
      <h4>1. Стандарт 5S по контролю инструмента</h4>
      <p>У каждого инструмента на площадке есть закреплённое место с маркировкой уникального Tool ID, силуэтом на теневой доске и координатами адреса хранения.</p>
      <h4>2. Выдача и чистота</h4>
      <p>Инструмент выдаётся до начала смены и возвращается очищенным и протёртым до вечернего построения.</p>
    `,
    revision: '3',
    effectiveDate: '2025-05-10',
    approvedBy: 'I. Tolipov',
    ownerRole: 'Administrator',
    status: 'Approved',
  },
  {
    id: 'SOP-TW-01',
    titleEn: 'Torque Wrench Calibration & Handling',
    titleRu: 'Калибровка и обращение с динамометрическими ключами',
    bodyEn: `
      <h4>1. Purpose &amp; Scope</h4>
      <p>Standardized procedures for using, resetting, and storing calibrated torque wrenches across assembly lines.</p>
      <h4>2. Zeroing &amp; Reset Requirement</h4>
      <p>Immediately after use, every mechanical click-type torque wrench <strong>MUST</strong> be dialed back to the lowest calibrated index value (never below zero). Leaving springs tensioned causes irreversible spring fatigue and accuracy drift.</p>
      <h4>3. Drop &amp; Shock Protocols</h4>
      <p>If any torque wrench experiences a drop greater than 1 meter onto concrete, it is immediately quarantined and submitted for recalibration.</p>
    `,
    bodyRu: `
      <h4>1. Назначение и область применения</h4>
      <p>Единый порядок применения, сброса и хранения калиброванных динамометрических ключей на сборочных линиях.</p>
      <h4>2. Обязательный сброс показаний</h4>
      <p>Сразу после применения каждый механический щелчковый динамометрический ключ <strong>ОБЯЗАТЕЛЬНО</strong> переводится на минимальное калиброванное значение (но не ниже нуля). Оставленная под нагрузкой пружина получает необратимую усталость, и точность уходит.</p>
      <h4>3. Падение и удар</h4>
      <p>При падении динамометрического ключа с высоты более 1 метра на бетон он немедленно изымается из работы и отправляется на перекалибровку.</p>
    `,
    revision: '2',
    effectiveDate: '2025-06-01',
    approvedBy: 'I. Tolipov',
    ownerRole: 'Tool Crib Manager',
    status: 'Approved',
    appliesTo: { toolClasses: ['TW'] },
  },
  {
    id: 'SOP-BT-02',
    titleEn: 'Li-Ion Battery Charging & Thermal Health',
    titleRu: 'Зарядка Li-Ion аккумуляторов и тепловой режим',
    bodyEn: `
      <h4>1. Purpose &amp; Scope</h4>
      <p>Prevents battery degradation and thermal runaway incidents on high-cycle power tool cells.</p>
      <h4>2. Charging Rules</h4>
      <p>Allow battery packs to reach room temperature (18°C–25°C) before placing on rapid chargers. Never charge packs that feel hot to the touch.</p>
    `,
    bodyRu: `
      <h4>1. Назначение и область применения</h4>
      <p>Предотвращение деградации батарей и теплового разгона на аккумуляторах инструмента с высокой цикличностью.</p>
      <h4>2. Правила зарядки</h4>
      <p>Перед установкой на быстрое зарядное устройство дайте батарее принять комнатную температуру (18–25 °C). Никогда не заряжайте батареи, которые горячие на ощупь.</p>
    `,
    revision: '2',
    effectiveDate: '2025-06-01',
    approvedBy: 'I. Tolipov',
    ownerRole: 'Tool Crib Manager',
    status: 'Approved',
    appliesTo: { toolClasses: ['BT'] },
  },
  {
    id: 'SOP-PB-03',
    titleEn: 'Cutting Bits & Wear Limits',
    titleRu: 'Режущие биты и пределы износа',
    bodyEn: `
      <h4>1. Purpose &amp; Scope</h4>
      <p>Defines replacement thresholds for driver bits, milling cutters, and consumables.</p>
      <h4>2. Inspection Limits</h4>
      <p>Bits with rounding on drive lobes exceeding 0.3mm or flank wear &gt;0.2mm must be scrapped immediately into dedicated recycling bins.</p>
    `,
    bodyRu: `
      <h4>1. Назначение и область применения</h4>
      <p>Определяет пороги замены бит, фрез и расходных материалов.</p>
      <h4>2. Пределы износа</h4>
      <p>Биты со скруглением рабочих граней более 0,3 мм или износом боковой поверхности более 0,2 мм немедленно списываются в отдельный контейнер для утилизации.</p>
    `,
    revision: '1',
    effectiveDate: '2025-07-15',
    approvedBy: 'I. Tolipov',
    ownerRole: 'Tool Crib Manager',
    status: 'Approved',
    appliesTo: { toolClasses: ['PB', 'DR', 'AB'] },
  },
];