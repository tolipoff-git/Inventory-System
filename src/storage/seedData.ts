import { Tool } from "../types/inventory";
import { SystemUser } from "../types/personnel";

export const SEED_USERS: SystemUser[] = [
  {
    "username": "admin",
    "pwHash": "4813494d137e1631bba301d5acab6e7bb7aa74ce1185d456565ef51d737677b2",
    "role": "Administrator"
  },
  {
    "username": "operator",
    "pwHash": "e606e38b0d8c19b24cf0ee3808183162ea7cd63ff7912dbb22b5e803286b4446",
    "role": "Operator"
  },
  {
    "username": "crib_tech",
    "pwHash": "0ff9e07cc1b519286a5575a350808f735f35cd7219448f1be98f78ea11ca5e8a",
    "role": "Tool Crib Manager"
  }
];

export const SEED_WORKSTATIONS: string[] = [
  "Tool Gage",
  "Machine Shop"
];

export const SEED_TOOLS: Tool[] = [
  {
    "id": "BW-001",
    "name": "Combination Box Wrench Set 8-19mm (Metric)",
    "type": "Permanent",
    "category": "Hand Tools",
    "location": "Shadow Board",
    "status": "Active",
    "spec": "8-19mm",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "BW-002",
    "name": "Combination Box Wrench Set 1/4\"-3/4\" (SAE Inch)",
    "type": "Permanent",
    "category": "Hand Tools",
    "location": "Tool Crib",
    "status": "Backup",
    "spec": "1/4\"-3/4\"",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "SK-001",
    "name": "1/2\" Drive Metric Socket Set 10-32mm with Ratchet",
    "type": "Permanent",
    "category": "Hand Tools",
    "location": "Shadow Board",
    "status": "Issued",
    "spec": "10-32mm",
    "assigneeId": "EMP-03",
    "assignedAt": "2026-08-03T14:39:20.924Z",
    "dueReturn": "2026-08-04T14:39:20.924Z",
    "calDue": null,
    "history": [
      "Assigned to Igor Tolipov (Signed: IT)"
    ],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "SK-002",
    "name": "3/8\" Drive Deep Socket Set 8-19mm",
    "type": "Permanent",
    "category": "Hand Tools",
    "location": "USS / Center Conveyor",
    "status": "Issued",
    "spec": "8-19mm",
    "assigneeId": "EMP-01",
    "assignedAt": "2026-08-01T14:28:17.878Z",
    "dueReturn": "2026-08-08T14:28:17.878Z",
    "calDue": null,
    "history": [
      "Issued to EMP-01"
    ],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "SK-003",
    "name": "1/4\" Drive SAE Inch Socket Set 3/16\"-1/2\"",
    "type": "Permanent",
    "category": "Hand Tools",
    "location": "Tool Crib",
    "status": "Backup",
    "spec": "3/16\"-1/2\"",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "TM-001",
    "name": "Heavy-Duty Metric Tape Measure 5m (Class II)",
    "type": "Permanent",
    "category": "Measurement",
    "location": "Sub-Assembly / Station 4B",
    "status": "Issued",
    "spec": "5m",
    "assigneeId": "EMP-02",
    "assignedAt": "2026-08-02T14:28:17.878Z",
    "dueReturn": "2026-08-09T14:28:17.878Z",
    "calDue": null,
    "history": [
      "Issued to EMP-02"
    ],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "TM-002",
    "name": "Dual Metric / SAE Inch Tape Measure 16ft / 5m",
    "type": "Permanent",
    "category": "Measurement",
    "location": "Shadow Board",
    "status": "Active",
    "spec": "16ft / 5m",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "TW-001",
    "name": "Torque Wrench 10-50Nm 1/2\" Drive (M8/M10 Bolts)",
    "type": "Permanent",
    "category": "Hand Tools",
    "location": "Shadow Board",
    "status": "Active",
    "spec": "10-50Nm",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": "2026-09-02T14:28:17.878Z",
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "TW-002",
    "name": "Precision Micro Torque Screwdriver 0.5-5Nm (Terminal Blocks)",
    "type": "Permanent",
    "category": "Hand Tools",
    "location": "Calibration Lab",
    "status": "Maintenance",
    "spec": "0.5-5Nm",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": "2026-08-01T14:28:17.878Z",
    "history": [
      "Sent for calibration"
    ],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "VT-001",
    "name": "1000V Insulated Screwdriver Set Slot/PH/PZ (VDE Certified)",
    "type": "Permanent",
    "category": "Electrical",
    "location": "Shadow Board",
    "status": "Active",
    "spec": "1000V VDE",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "VT-002",
    "name": "1000V Insulated Cable Shears & Cutter (VDE)",
    "type": "Permanent",
    "category": "Electrical",
    "location": "Shadow Board",
    "status": "Active",
    "spec": "1000V VDE",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "VT-003",
    "name": "Ratchet Ferrule Bootlace Crimping Pliers 0.25-10mm² (24V Wiring)",
    "type": "Permanent",
    "category": "Electrical",
    "location": "USS / Center Conveyor",
    "status": "Issued",
    "spec": "0.25-10mm²",
    "assigneeId": "EMP-01",
    "assignedAt": "2026-08-03T14:29:00.193Z",
    "dueReturn": "2026-08-04T14:29:00.193Z",
    "calDue": null,
    "history": [
      "Issued to EMP-01",
      "Assigned to Pavel Volkov (Signed: pv)"
    ],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "VT-004",
    "name": "Heavy-Duty Hex Lug Crimper 10-120mm² (480V Power Busbars)",
    "type": "Permanent",
    "category": "Electrical",
    "location": "Tool Crib",
    "status": "Backup",
    "spec": "10-120mm²",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "VT-005",
    "name": "Automatic Precision Wire Stripper (24V Signal Wiring)",
    "type": "Permanent",
    "category": "Electrical",
    "location": "Sub-Assembly / Station 4B",
    "status": "Issued",
    "spec": "Auto",
    "assigneeId": "EMP-02",
    "assignedAt": "2026-08-02T14:28:17.878Z",
    "dueReturn": "2026-08-09T14:28:17.878Z",
    "calDue": null,
    "history": [
      "Issued to EMP-02"
    ],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "DC-001",
    "name": "True RMS Digital Multimeter CAT IV 600V / CAT III 1000V",
    "type": "Permanent",
    "category": "Electrical",
    "location": "Shadow Board",
    "status": "Active",
    "spec": "CAT IV 600V",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": "2026-11-01T14:28:17.878Z",
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "DC-002",
    "name": "AC/DC Clamp Meter 600A (480V Line Current)",
    "type": "Permanent",
    "category": "Electrical",
    "location": "Tool Crib",
    "status": "Backup",
    "spec": "600A",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": "2026-12-01T14:28:17.878Z",
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "DC-003",
    "name": "Megohmmeter 1000V Insulation Resistance Tester",
    "type": "Permanent",
    "category": "Electrical",
    "location": "Calibration Lab",
    "status": "Maintenance",
    "spec": "1000V",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": "2026-07-29T14:28:17.878Z",
    "history": [
      "Sent for maintenance"
    ],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "BT-001",
    "name": "18V 5.0Ah Li-Ion Battery Pack A",
    "type": "Consumable",
    "category": "Power",
    "location": "USS / Center Conveyor",
    "status": "Issued",
    "spec": "18V 5.0Ah",
    "assigneeId": "EMP-01",
    "assignedAt": "2026-08-02T14:28:17.878Z",
    "dueReturn": "2026-08-04T14:28:17.878Z",
    "calDue": null,
    "history": [
      "Issued to EMP-01"
    ],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "BT-002",
    "name": "18V 5.0Ah Li-Ion Battery Pack B",
    "type": "Consumable",
    "category": "Power",
    "location": "Charging Station",
    "status": "Active",
    "spec": "18V 5.0Ah",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "PB-001",
    "name": "Industrial Impact Power Bit Set (PH/PZ/Torx/Hex)",
    "type": "Consumable",
    "category": "Power Accessories",
    "location": "Shadow Board",
    "status": "Active",
    "spec": "Multi",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "MC-001",
    "name": "DIN Rail & Cable Duct Cutter Jig",
    "type": "Permanent",
    "category": "Electrical",
    "location": "Tool Crib",
    "status": "Backup",
    "spec": "Jig",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  },
  {
    "id": "MC-002",
    "name": "HSS Step Drill Bit 4-32mm (Panel Enclosure Glands)",
    "type": "Consumable",
    "category": "Power Accessories",
    "location": "Shadow Board",
    "status": "Active",
    "spec": "4-32mm",
    "assigneeId": null,
    "assignedAt": null,
    "dueReturn": null,
    "calDue": null,
    "history": [],
    "commissioned_date": "2025-05-10",
    "audit_history": [
      {
        "date": "2025-08-10",
        "inspector": "A.K.",
        "wear_pct": 12,
        "notes": "Routine check passed",
        "result": "PASS"
      }
    ]
  }
];
