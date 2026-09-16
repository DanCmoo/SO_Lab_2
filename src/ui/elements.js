/**
 * Cached DOM element references.
 */
export const elements = {
  // Selectors & Controls
  selectMode: document.getElementById('select-mode'),
  selectAlgorithm: document.getElementById('select-algorithm'),
  btnStartSim: document.getElementById('btn-start-sim'),
  btnUndo: document.getElementById('btn-undo'),
  btnCompactTop: document.getElementById('btn-compact-top'),
  btnCompare: document.getElementById('btn-compare'),
  btnExportScenario: document.getElementById('btn-export-scenario'),
  btnImportScenario: document.getElementById('btn-import-scenario'),
  btnReset: document.getElementById('btn-reset'),

  // Config panel
  badgeSimPhase: document.getElementById('badge-sim-phase'),
  formConfig: document.getElementById('form-config'),
  inputOsSize: document.getElementById('input-os-size'),
  selectOsUnit: document.getElementById('select-os-unit'),
  groupEqualConfig: document.getElementById('group-equal-config'),
  inputEqualCount: document.getElementById('input-equal-count'),
  txtEqualCalc: document.getElementById('txt-equal-calc'),
  groupUnequalConfig: document.getElementById('group-unequal-config'),
  inputUnequalSizes: document.getElementById('input-unequal-sizes'),
  txtUnequalCalc: document.getElementById('txt-unequal-calc'),
  btnApplyConfig: document.getElementById('btn-apply-config'),

  // Queue panel
  btnOpenNewProgram: document.getElementById('btn-open-new-program'),
  btnRestoreDefaults: document.getElementById('btn-restore-defaults'),
  queueList: document.getElementById('queue-list'),

  // Memory map panel
  statusBanner: document.getElementById('status-banner'),
  statusText: document.getElementById('status-text'),
  statusActions: document.getElementById('status-actions'),
  btnToggleTable: document.getElementById('btn-toggle-table'),
  proportionalRail: document.getElementById('proportional-rail'),
  detailedRail: document.getElementById('detailed-rail'),
  accessibleMemoryTableWrap: document.getElementById('accessible-memory-table-wrap'),
  accessibleTableBody: document.getElementById('accessible-table-body'),

  // Metrics panel
  metricAllocated: document.getElementById('metric-allocated'),
  metricFree: document.getElementById('metric-free'),
  metricUtilization: document.getElementById('metric-utilization'),
  metricInternalFrag: document.getElementById('metric-internal-frag'),
  metricLargestHole: document.getElementById('metric-largest-hole'),
  metricFreeCount: document.getElementById('metric-free-count'),
  metricResidentCount: document.getElementById('metric-resident-count'),
  metricProbes: document.getElementById('metric-probes'),

  // Inspector & History
  inspectorContent: document.getElementById('inspector-content'),
  historyFeed: document.getElementById('history-feed'),

  // Dialogs
  dialogNewProgram: document.getElementById('dialog-new-program'),
  inputProgName: document.getElementById('input-prog-name'),
  newProgSegmentsList: document.getElementById('new-prog-segments-list'),
  btnAddSegmentRow: document.getElementById('btn-add-segment-row'),
  txtCalcProgSize: document.getElementById('txt-calc-prog-size'),
  btnSaveCustomProg: document.getElementById('btn-save-custom-prog'),

  dialogCompactPreview: document.getElementById('dialog-compact-preview'),
  compactPreviewList: document.getElementById('compact-preview-list'),
  txtCompactBytes: document.getElementById('txt-compact-bytes'),
  btnConfirmCompaction: document.getElementById('btn-confirm-compaction'),

  dialogCompare: document.getElementById('dialog-compare'),
  compareModalContent: document.getElementById('compare-modal-content'),

  dialogImport: document.getElementById('dialog-import'),
  textareaScenarioJson: document.getElementById('textarea-scenario-json'),
  btnConfirmImport: document.getElementById('btn-confirm-import'),

  dialogConfirmReset: document.getElementById('dialog-confirm-reset'),
  btnConfirmReset: document.getElementById('btn-confirm-reset'),

  dialogResume: document.getElementById('dialog-resume'),
  btnResumeConfirm: document.getElementById('btn-resume-confirm'),
  btnResumeStartOver: document.getElementById('btn-resume-start-over'),

  // Accessibility
  liveAnnouncer: document.getElementById('live-announcer')
};
