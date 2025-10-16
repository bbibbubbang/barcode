const form = document.getElementById('label-form');
const labelList = document.getElementById('label-list');
const previewContainer = document.getElementById('label-preview');
const previewPagination = document.getElementById('preview-pagination');
const addButton = document.getElementById('add-button');
const completeEditButton = document.getElementById('complete-edit-button');
const resetButton = document.getElementById('reset-button');
const printButton = document.getElementById('print-button');
const downloadButton = document.getElementById('download-button');
const printRoot = document.getElementById('print-root');

const PRINT_PAGE_STYLE_ID = 'barcode-maker-print-page-size';

const STORAGE_KEYS = {
  labels: 'barcode-maker:labels',
  form: 'barcode-maker:form',
  preferences: 'barcode-maker:preferences',
};

const LABEL_VERTICAL_PADDING_MM = 4; // 총 상하 패딩 (styles.css와 동일해야 함)
const LABEL_HORIZONTAL_PADDING_MM = 6; // 총 좌우 패딩 (styles.css와 동일해야 함)
const LABEL_GAP_MM = 1.3; // 라벨 내부 요소 간 기본 간격 (styles.css와 동일해야 함)
const LABEL_GAP_OVERRIDE_PROPERTY = '--label-gap-override';
const LABEL_LINE_GAP_OVERRIDE_PROPERTY = '--line-gap-override';
const MIN_BARCODE_HEIGHT_PX = 8;
const LINE_HEIGHT_RATIO = 1.2;
const PDF_SPACE_WIDTH_ADJUST_THRESHOLD = 0.5;
const PDF_SPACE_WIDTH_TARGET_RATIO = 0.33;
const BARCODE_CANVAS_SCALE = 2;

const PDF_LIB_SOURCE_URL = 'vendor/pdf-lib.min.js';
const PDF_FONTKIT_SOURCE_URL = 'vendor/fontkit.umd.min.js';
const PDF_FONT_SOURCE_URLS = {
  regular: {
    url: 'vendor/NotoSansCJKkr-Regular.otf',
    fileName: 'NotoSansCJKkr-Regular.otf',
  },
  bold: {
    url: 'vendor/NotoSansCJKkr-Bold.otf',
    fileName: 'NotoSansCJKkr-Bold.otf',
  },
};

const BARCODE_TEXT_STYLE_OVERRIDES = {
  fill: '#111827',
  fontFamily: "'Noto Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  fontWeight: '600',
  letterSpacing: '0.08em',
};

const state = {
  labels: [],
  draft: null,
  activePreviewIndex: 0,
  editingLabelId: null,
};

let isResettingForm = false;
let printPageStyleElement = null;
let hasWarnedPrintSizeMismatch = false;

function updateFormEditingState() {
  const isEditing = Boolean(state.editingLabelId);

  if (form) {
    form.dataset.editing = isEditing ? 'true' : 'false';
  }

  if (addButton) {
    addButton.hidden = isEditing;
  }

  if (completeEditButton) {
    completeEditButton.hidden = !isEditing;
    completeEditButton.disabled = !isEditing;
  }
}

const MM_TO_PX = 96 / 25.4;
const MM_TO_PT = 72 / 25.4;
const PX_TO_PT = 72 / 96;
function mmToPx(mm) {
  return mm * MM_TO_PX;
}

function mmToPt(mm) {
  return mm * MM_TO_PT;
}

function pxToPt(px) {
  return px * PX_TO_PT;
}

function getPrintPageSizeFromLabels(labels, options = {}) {
  if (!Array.isArray(labels) || labels.length === 0) return null;

  const { warn = true } = options;

  const activeIndex = Math.min(
    Math.max(state.activePreviewIndex, 0),
    labels.length - 1,
  );

  const targetLabel = labels[activeIndex] || labels[0];
  const width = Number(targetLabel.labelWidth);
  const height = Number(targetLabel.labelHeight);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  const hasDifferentSize = labels.some((label) => {
    if (!label) return false;
    return (
      Number(label.labelWidth) !== width || Number(label.labelHeight) !== height
    );
  });

  if (hasDifferentSize) {
    if (warn && !hasWarnedPrintSizeMismatch) {
      // eslint-disable-next-line no-console
      console.warn(
        '모든 라벨의 크기가 동일하지 않습니다. 첫 번째 라벨의 크기로 페이지 크기를 설정합니다.',
      );
      hasWarnedPrintSizeMismatch = true;
    }
  } else {
    hasWarnedPrintSizeMismatch = false;
  }

  return { width, height };
}

function applyPrintPageSize(widthMm, heightMm) {
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) {
    removePrintPageSize();
    return;
  }

  if (!printPageStyleElement) {
    printPageStyleElement = document.getElementById(PRINT_PAGE_STYLE_ID);
    if (!printPageStyleElement) {
      printPageStyleElement = document.createElement('style');
      printPageStyleElement.id = PRINT_PAGE_STYLE_ID;
      document.head.appendChild(printPageStyleElement);
    }
  }

  printPageStyleElement.textContent = `@media print {\n  @page {\n    size: ${widthMm}mm ${heightMm}mm;\n    margin: 0;\n  }\n}`;

  if (printRoot) {
    printRoot.style.setProperty('--print-page-width', `${widthMm}mm`);
    printRoot.style.setProperty('--print-page-height', `${heightMm}mm`);
  }
}

function applyPrintPageSizeFromLabels(labels) {
  const pageSize = getPrintPageSizeFromLabels(labels);
  if (!pageSize) {
    removePrintPageSize();
    return;
  }

  applyPrintPageSize(pageSize.width, pageSize.height);
}

function removePrintPageSize() {
  if (printPageStyleElement && printPageStyleElement.parentNode) {
    printPageStyleElement.parentNode.removeChild(printPageStyleElement);
  }
  printPageStyleElement = null;
  hasWarnedPrintSizeMismatch = false;

  if (printRoot) {
    printRoot.style.removeProperty('--print-page-width');
    printRoot.style.removeProperty('--print-page-height');
  }
}

function getJsBarcode() {
  if (typeof globalThis === 'undefined') return null;
  const library = globalThis.JsBarcode;
  return typeof library === 'function' ? library : null;
}

function parseNumericAttribute(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function applyBarcodeSvgSizing(svg) {
  if (!svg) {
    return;
  }

  const width = parseNumericAttribute(svg.getAttribute('width'));
  const height = parseNumericAttribute(svg.getAttribute('height'));

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('width', '100%');
  svg.style.width = '100%';
}

function applyBarcodeTextStyling(svg) {
  if (!svg) {
    return;
  }

  const textElements = svg.querySelectorAll('text');
  textElements.forEach((element) => {
    if (!element) {
      return;
    }

    element.setAttribute('fill', BARCODE_TEXT_STYLE_OVERRIDES.fill);
    element.style.setProperty('font-family', BARCODE_TEXT_STYLE_OVERRIDES.fontFamily);
    element.style.setProperty('font-weight', BARCODE_TEXT_STYLE_OVERRIDES.fontWeight);
    element.style.setProperty(
      'letter-spacing',
      BARCODE_TEXT_STYLE_OVERRIDES.letterSpacing,
      'important',
    );
  });
}

function applyBarcodeSvgOverrides(svg) {
  if (!svg) {
    return;
  }

  applyBarcodeSvgSizing(svg);
  applyBarcodeTextStyling(svg);
}

function renderBarcode(svg, value, options) {
  const JsBarcodeLibrary = getJsBarcode();
  if (!JsBarcodeLibrary) {
    return false;
  }

  try {
    JsBarcodeLibrary(svg, value, options);
    applyBarcodeSvgOverrides(svg);
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('바코드 생성 중 오류가 발생했습니다.', error);
    return false;
  }
}

function generateId() {
  if (typeof globalThis !== 'undefined') {
    const { crypto: globalCrypto } = globalThis;
    if (globalCrypto) {
      if (typeof globalCrypto.randomUUID === 'function') {
        return globalCrypto.randomUUID();
      }

      if (typeof globalCrypto.getRandomValues === 'function') {
        const bytes = globalCrypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        const segments = [
          bytes.subarray(0, 4),
          bytes.subarray(4, 6),
          bytes.subarray(6, 8),
          bytes.subarray(8, 10),
          bytes.subarray(10, 16),
        ];

        const hex = segments
          .map((segment) =>
            Array.from(segment)
              .map((byte) => byte.toString(16).padStart(2, '0'))
              .join(''),
          )
          .join('-');

        return hex;
      }
    }
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getFormValues() {
  const formData = new FormData(form);

  return {
    productName: (formData.get('productName') || '').trim(),
    subProductName: (formData.get('subProductName') || '').trim(),
    barcodeValue: (formData.get('barcodeValue') || '').trim(),
    barcodeType: formData.get('barcodeType') || 'code128',
    productFontSize: Number(formData.get('productFontSize')),
    subProductFontSize: Number(formData.get('subProductFontSize')),
    barcodeFontSize: Number(formData.get('barcodeFontSize')),
    labelWidth: Number(formData.get('labelWidth')),
    labelHeight: Number(formData.get('labelHeight')),
    showText: formData.get('showText') === 'on',
    includeName: formData.get('includeName') === 'on',
  };
}

function normalizeNumber(value, { min, max, fallback }) {
  if (!Number.isFinite(value)) return fallback;

  let nextValue = value;
  if (typeof min === 'number') {
    nextValue = Math.max(nextValue, min);
  }
  if (typeof max === 'number') {
    nextValue = Math.min(nextValue, max);
  }

  if (Number.isInteger(fallback)) {
    nextValue = Math.round(nextValue);
  }

  return nextValue;
}

function getDefaults() {
  return {
    productFontSize: Number(form.elements.productFontSize?.defaultValue) || 16,
    subProductFontSize:
      Number(form.elements.subProductFontSize?.defaultValue) || 14,
    barcodeFontSize: Number(form.elements.barcodeFontSize?.defaultValue) || 12,
    labelWidth: Number(form.elements.labelWidth?.defaultValue) || 60,
    labelHeight: Number(form.elements.labelHeight?.defaultValue) || 40,
  };
}

function withFallbacks(values) {
  const defaults = getDefaults();

  return {
    ...values,
    productFontSize: normalizeNumber(values.productFontSize, {
      min: 8,
      max: 36,
      fallback: defaults.productFontSize,
    }),
    subProductFontSize: normalizeNumber(values.subProductFontSize, {
      min: 8,
      max: 32,
      fallback: defaults.subProductFontSize,
    }),
    barcodeFontSize: normalizeNumber(values.barcodeFontSize, {
      min: 8,
      max: 28,
      fallback: defaults.barcodeFontSize,
    }),
    labelWidth: normalizeNumber(values.labelWidth, {
      min: 30,
      max: 100,
      fallback: defaults.labelWidth,
    }),
    labelHeight: normalizeNumber(values.labelHeight, {
      min: 20,
      max: 60,
      fallback: defaults.labelHeight,
    }),
  };
}

function persistLabels() {
  try {
    localStorage.setItem(STORAGE_KEYS.labels, JSON.stringify(state.labels));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('라벨 정보를 저장하는 중 오류가 발생했습니다.', error);
  }
}

function persistFormState(values) {
  try {
    localStorage.setItem(STORAGE_KEYS.form, JSON.stringify(values));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('폼 정보를 저장하는 중 오류가 발생했습니다.', error);
  }
}

function getPreferenceDefaults() {
  const defaults = getDefaults();

  return {
    ...defaults,
    showText: Boolean(form.elements.showText?.defaultChecked),
    includeName: Boolean(form.elements.includeName?.defaultChecked),
  };
}

function extractPreferences(values) {
  if (!values || typeof values !== 'object') {
    return null;
  }

  const defaults = getPreferenceDefaults();

  return {
    productFontSize: normalizeNumber(Number(values.productFontSize), {
      min: 8,
      max: 36,
      fallback: defaults.productFontSize,
    }),
    subProductFontSize: normalizeNumber(Number(values.subProductFontSize), {
      min: 8,
      max: 32,
      fallback: defaults.subProductFontSize,
    }),
    barcodeFontSize: normalizeNumber(Number(values.barcodeFontSize), {
      min: 8,
      max: 28,
      fallback: defaults.barcodeFontSize,
    }),
    labelWidth: normalizeNumber(Number(values.labelWidth), {
      min: 30,
      max: 100,
      fallback: defaults.labelWidth,
    }),
    labelHeight: normalizeNumber(Number(values.labelHeight), {
      min: 20,
      max: 60,
      fallback: defaults.labelHeight,
    }),
    showText:
      typeof values.showText === 'boolean' ? values.showText : defaults.showText,
    includeName:
      typeof values.includeName === 'boolean'
        ? values.includeName
        : defaults.includeName,
  };
}

function persistPreferences(values) {
  const preferences = extractPreferences(values);
  if (!preferences) return;

  try {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(preferences));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('환경 설정을 저장하는 중 오류가 발생했습니다.', error);
  }
}

function getStoredPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.preferences);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return extractPreferences(parsed);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('환경 설정을 불러오는 중 오류가 발생했습니다.', error);
    return null;
  }
}

function applyPreferencesFromStorage() {
  const preferences = getStoredPreferences();
  if (!preferences) return null;

  isResettingForm = true;
  applyFormValues(preferences);
  isResettingForm = false;

  return preferences;
}

function applyFormValues(values) {
  if (!values || typeof values !== 'object') return;

  const elements = form.elements;

  if ('productName' in values) {
    elements.productName.value = (values.productName ?? '').toString();
  }

  if ('subProductName' in values) {
    elements.subProductName.value = (values.subProductName ?? '').toString();
  }

  if ('barcodeValue' in values) {
    elements.barcodeValue.value = (values.barcodeValue ?? '').toString();
  }

  if (Number.isFinite(values.productFontSize)) {
    elements.productFontSize.value = values.productFontSize;
  }

  if (Number.isFinite(values.subProductFontSize)) {
    elements.subProductFontSize.value = values.subProductFontSize;
  }

  if (Number.isFinite(values.barcodeFontSize)) {
    elements.barcodeFontSize.value = values.barcodeFontSize;
  }

  if (Number.isFinite(values.labelWidth)) {
    elements.labelWidth.value = values.labelWidth;
  }

  if (Number.isFinite(values.labelHeight)) {
    elements.labelHeight.value = values.labelHeight;
  }

  if (typeof values.barcodeType === 'string') {
    elements.barcodeType.value = values.barcodeType;
  }

  if (typeof values.showText === 'boolean') {
    elements.showText.checked = values.showText;
  }

  if (typeof values.includeName === 'boolean') {
    elements.includeName.checked = values.includeName;
  }
}

function restoreLabels() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.labels);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      state.labels = parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const sanitized = withFallbacks({
            ...item,
            productName: (item.productName || '').toString().trim(),
            subProductName: (item.subProductName || '').toString().trim(),
            barcodeValue: (item.barcodeValue || '').toString().trim(),
            barcodeType: item.barcodeType || 'code128',
            showText: item.showText !== false,
            includeName: item.includeName !== false,
            productFontSize: Number(item.productFontSize),
            subProductFontSize: Number(item.subProductFontSize),
            barcodeFontSize: Number(item.barcodeFontSize),
            labelWidth: Number(item.labelWidth),
            labelHeight: Number(item.labelHeight),
          });

          return {
            ...sanitized,
            id: typeof item.id === 'string' && item.id ? item.id : generateId(),
          };
        });
      persistLabels();
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('저장된 라벨을 불러오는 중 오류가 발생했습니다.', error);
  }
}

function restoreFormState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.form);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    isResettingForm = true;
    applyFormValues(parsed);

    persistPreferences(parsed);

    return parsed;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('저장된 폼을 불러오는 중 오류가 발생했습니다.', error);
    return null;
  } finally {
    isResettingForm = false;
  }
}

function createLabelEntry(label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'label-list__item';
  wrapper.dataset.id = label.id;
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'button');
  wrapper.setAttribute('aria-pressed', 'false');

  wrapper.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    focusPreviewOnLabel(label.id);
  });

  wrapper.addEventListener('keydown', (event) => {
    if (event.target.closest('button')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      focusPreviewOnLabel(label.id);
    }
  });

  const info = document.createElement('div');
  info.className = 'label-list__info';

  const name = document.createElement('strong');
  name.textContent = label.productName;
  info.appendChild(name);

  if (label.subProductName) {
    const subName = document.createElement('div');
    subName.className = 'label-list__subname';
    subName.textContent = label.subProductName;
    info.appendChild(subName);
  }

  const barcode = document.createElement('div');
  barcode.className = 'label-list__barcode';
  barcode.textContent = `바코드: ${label.barcodeValue}`;
  info.appendChild(barcode);

  const meta = document.createElement('div');
  meta.className = 'label-list__meta';
  meta.textContent = `${label.labelWidth} × ${label.labelHeight} mm`;

  const actions = document.createElement('div');
  actions.className = 'label-list__actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'label-list__edit';
  editButton.textContent = '수정';
  if (state.editingLabelId === label.id) {
    editButton.textContent = '수정 중';
    editButton.disabled = true;
  } else {
    editButton.addEventListener('click', () => {
      startEditingLabel(label.id);
    });
  }

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'label-list__remove';
  removeButton.textContent = '삭제';
  removeButton.addEventListener('click', () => {
    removeLabel(label.id);
  });

  wrapper.appendChild(info);
  wrapper.appendChild(meta);
  actions.appendChild(editButton);
  actions.appendChild(removeButton);
  wrapper.appendChild(actions);

  return wrapper;
}

function focusPreviewOnLabel(id) {
  const previewLabels = getPreviewLabels();
  const index = previewLabels.findIndex((label) => label.id === id);
  if (index === -1) return;

  if (state.activePreviewIndex !== index) {
    state.activePreviewIndex = index;
    renderPreview();
  }
}

function startEditingLabel(id) {
  const labelIndex = state.labels.findIndex((item) => item.id === id);
  if (labelIndex === -1) return;

  const targetLabel = state.labels[labelIndex];
  const sanitized = withFallbacks(targetLabel);

  state.editingLabelId = id;

  isResettingForm = true;
  applyFormValues(sanitized);
  isResettingForm = false;

  persistPreferences(sanitized);

  state.draft = {
    ...sanitized,
    id,
    isDraft: true,
    isEditing: true,
  };

  const previewLabels = getPreviewLabels();
  const previewIndex = previewLabels.findIndex((label) => label.id === id);
  state.activePreviewIndex = previewIndex === -1 ? labelIndex : previewIndex;

  persistFormState({
    productName: sanitized.productName,
    subProductName: sanitized.subProductName,
    barcodeValue: sanitized.barcodeValue,
    barcodeType: sanitized.barcodeType,
    productFontSize: sanitized.productFontSize,
    subProductFontSize: sanitized.subProductFontSize,
    barcodeFontSize: sanitized.barcodeFontSize,
    labelWidth: sanitized.labelWidth,
    labelHeight: sanitized.labelHeight,
    showText: sanitized.showText,
    includeName: sanitized.includeName,
  });

  updateFormEditingState();
  renderPreview();
}

function renderLabelList(activeLabelId) {
  labelList.innerHTML = '';
  if (state.labels.length === 0) {
    labelList.innerHTML = '<p class="label-preview__empty">추가된 라벨이 없습니다.</p>';
    return;
  }

  let highlightId = activeLabelId;
  if (typeof highlightId === 'undefined') {
    const activePreview = getActivePreviewLabel();
    highlightId = activePreview ? activePreview.id : null;
  }

  const fragment = document.createDocumentFragment();
  state.labels.forEach((label) => {
    const entry = createLabelEntry(label);
    if (highlightId && label.id === highlightId) {
      entry.classList.add('label-list__item--active');
    }
    entry.setAttribute('aria-pressed', highlightId && label.id === highlightId ? 'true' : 'false');
    if (state.editingLabelId === label.id) {
      entry.setAttribute('data-editing', 'true');
    }
    fragment.appendChild(entry);
  });
  labelList.appendChild(fragment);
}

function handleFormSubmit(event) {
  event.preventDefault();
  const rawValues = getFormValues();
  const formValues = withFallbacks(rawValues);

  persistPreferences(formValues);

  if (!formValues.productName || !formValues.barcodeValue) {
    alert('상품명과 바코드 값은 필수 입력 항목입니다.');
    return;
  }

  if (state.editingLabelId) {
    const index = state.labels.findIndex((label) => label.id === state.editingLabelId);
    if (index !== -1) {
      state.labels[index] = {
        id: state.editingLabelId,
        ...formValues,
      };
      state.activePreviewIndex = index;
    } else {
      state.labels.push({
        id: state.editingLabelId,
        ...formValues,
      });
      state.activePreviewIndex = state.labels.length - 1;
    }

    state.draft = null;
    state.editingLabelId = null;
    persistLabels();
    renderPreview();

    isResettingForm = true;
    form.reset();
    isResettingForm = false;
    updateFormEditingState();
    return;
  }

  const label = {
    id: generateId(),
    ...formValues,
  };

  state.labels.push(label);
  state.draft = null;
  state.activePreviewIndex = state.labels.length - 1;
  persistLabels();
  renderPreview();

  isResettingForm = true;
  form.reset();
  isResettingForm = false;
}

function removeLabel(id) {
  const index = state.labels.findIndex((label) => label.id === id);
  if (index === -1) return;

  const shouldRemove = confirm('선택한 라벨을 삭제할까요?');
  if (!shouldRemove) {
    return;
  }

  state.labels.splice(index, 1);
  persistLabels();

  if (state.editingLabelId === id) {
    state.editingLabelId = null;
    state.draft = null;
    isResettingForm = true;
    form.reset();
    isResettingForm = false;
    updateFormEditingState();
  }

  renderPreview();
}

function resetLabels() {
  if (state.labels.length === 0) return;
  if (confirm('모든 라벨을 삭제할까요?')) {
    state.labels = [];
    state.activePreviewIndex = 0;
    persistLabels();

    if (state.editingLabelId) {
      state.editingLabelId = null;
      updateFormEditingState();
      updateDraft();
      return;
    }

    renderPreview();
  }
}

function hasDraftContent(values) {
  return Boolean(values.productName || values.subProductName || values.barcodeValue);
}

function areLabelsEqual(a, b) {
  if (!a || !b) return false;

  const keys = [
    'productName',
    'subProductName',
    'barcodeValue',
    'barcodeType',
    'productFontSize',
    'subProductFontSize',
    'barcodeFontSize',
    'labelWidth',
    'labelHeight',
    'showText',
    'includeName',
  ];

  return keys.every((key) => a[key] === b[key]);
}

function getPreviewLabels() {
  if (state.editingLabelId) {
    return state.labels.map((label) => {
      if (label.id !== state.editingLabelId) {
        return label;
      }

      if (state.draft && state.draft.isEditing && hasDraftContent(state.draft)) {
        return {
          ...state.draft,
          id: label.id,
          isEditingPreview: true,
        };
      }

      return label;
    });
  }

  const labels = [...state.labels];
  if (state.draft && hasDraftContent(state.draft)) {
    const isDuplicate = labels.some((label) => areLabelsEqual(label, state.draft));
    if (!isDuplicate) {
      labels.push({
        ...state.draft,
        id: state.draft.id || 'draft',
        isDraft: true,
      });
    }
  }
  return labels;
}

function computePreviewState() {
  const previewLabels = getPreviewLabels();
  let activeIndex = state.activePreviewIndex;

  if (previewLabels.length === 0) {
    activeIndex = 0;
  } else {
    activeIndex = Math.min(Math.max(activeIndex, 0), previewLabels.length - 1);
  }

  if (activeIndex !== state.activePreviewIndex) {
    state.activePreviewIndex = activeIndex;
  }

  const activeLabel = previewLabels[activeIndex] || null;

  return { previewLabels, activeIndex, activeLabel };
}

function getActivePreviewLabel() {
  const { activeLabel } = computePreviewState();
  return activeLabel;
}

function computeBaseBarcodeHeightPx(label) {
  const baseHeightPx = mmToPx(label.labelHeight);
  const verticalPaddingPx = mmToPx(LABEL_VERTICAL_PADDING_MM);
  const gapPxBase = mmToPx(LABEL_GAP_MM);
  const gapCount = label.includeName
    ? label.subProductName
      ? 2
      : 1
    : 0;
  const totalGapPx = gapCount * gapPxBase;
  const reservedForNames = label.includeName
    ? label.productFontSize + (label.subProductName ? label.subProductFontSize : 0)
    : 0;
  const reservedForText = label.showText ? label.barcodeFontSize * 1.4 : 0;
  const availableHeight = Math.max(
    baseHeightPx - verticalPaddingPx - reservedForNames - reservedForText - totalGapPx,
    MIN_BARCODE_HEIGHT_PX,
  );

  return Math.max(Math.round(availableHeight), MIN_BARCODE_HEIGHT_PX);
}

function getBarcodeRenderOptions(label, options = {}) {
  const baseHeight = computeBaseBarcodeHeightPx(label);
  const { heightPx = null } = options;
  let targetHeight = baseHeight;

  if (Number.isFinite(heightPx)) {
    const safeHeight = Math.floor(heightPx);
    targetHeight = Math.max(
      Math.min(baseHeight, safeHeight),
      MIN_BARCODE_HEIGHT_PX,
    );
  }

  const safeTargetHeight = Number.isFinite(targetHeight)
    ? Math.max(targetHeight, MIN_BARCODE_HEIGHT_PX)
    : MIN_BARCODE_HEIGHT_PX;
  const heightValue = Math.max(Math.round(safeTargetHeight), MIN_BARCODE_HEIGHT_PX);

  return {
    format: mapBarcodeType(label.barcodeType),
    displayValue: false,
    fontSize: label.barcodeFontSize,
    height: Math.max(heightValue, 1),
    margin: 0,
    textMargin: 0,
    lineColor: '#111827',
  };
}

function parseCssNumber(value) {
  if (typeof value !== 'string') {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function removeLineGapOverrides(elements) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return;
  }

  elements.forEach((element) => {
    if (element && element.style) {
      element.style.removeProperty(LABEL_LINE_GAP_OVERRIDE_PROPERTY);
    }
  });
}

function applyLineGapCompression(elements, ratio, getComputedStyleFn) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return false;
  }

  if (typeof getComputedStyleFn !== 'function') {
    return false;
  }

  const safeRatio = Number.isFinite(ratio)
    ? Math.max(Math.min(ratio, 1), 0)
    : 0;

  let applied = false;

  elements.forEach((element) => {
    if (!element || !element.style) {
      return;
    }

    const style = getComputedStyleFn(element);
    if (!style) {
      return;
    }

    const fontSize = parseCssNumber(style.fontSize);
    let baseLineHeight = Number.parseFloat(element.dataset.baseLineHeight || '');

    if (!Number.isFinite(baseLineHeight) || baseLineHeight <= 0) {
      const computedLineHeight = parseCssNumber(style.lineHeight);

      if (Number.isFinite(computedLineHeight) && computedLineHeight > 0) {
        baseLineHeight = computedLineHeight;
      } else if (Number.isFinite(fontSize) && fontSize > 0) {
        baseLineHeight = fontSize * 1.2;
      } else {
        baseLineHeight = element.offsetHeight;
      }

      if (Number.isFinite(baseLineHeight) && baseLineHeight > 0) {
        element.dataset.baseLineHeight = String(baseLineHeight);
      }
    }

    if (!Number.isFinite(baseLineHeight) || baseLineHeight <= 0) {
      return;
    }

    const minimumLineHeight = Number.isFinite(fontSize) && fontSize > 0
      ? Math.max(Math.round(fontSize * 0.1), 1)
      : 1;
    const targetLineHeight = Math.max(
      Math.floor(baseLineHeight * safeRatio),
      minimumLineHeight,
    );

    element.style.setProperty(
      LABEL_LINE_GAP_OVERRIDE_PROPERTY,
      `${targetLineHeight}px`,
    );
    applied = true;
  });

  return applied;
}

function getBarcodeWrapperClass(element) {
  if (!element) return 'preview-label__barcode';
  return element.classList.contains('print-label')
    ? 'print-label__barcode'
    : 'preview-label__barcode';
}

function calculateBarcodeAvailableHeight(element, label) {
  if (!element || !label || !label.barcodeValue || !element.isConnected) {
    return null;
  }

  const getComputedStyleFn = globalThis.getComputedStyle;
  if (typeof getComputedStyleFn !== 'function') {
    return null;
  }

  const style = getComputedStyleFn(element);
  if (!style) {
    return null;
  }

  const paddingTop = parseCssNumber(style.paddingTop);
  const paddingBottom = parseCssNumber(style.paddingBottom);
  const clientHeight = element.clientHeight;

  if (!Number.isFinite(clientHeight)) {
    return null;
  }

  const contentHeight = clientHeight - paddingTop - paddingBottom;
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) {
    return null;
  }

  const barcodeClass = getBarcodeWrapperClass(element);
  const barcodeWrapper = element.querySelector(`.${barcodeClass}`);
  if (!barcodeWrapper) {
    return null;
  }

  const textItems = Array.from(element.children).filter((child) => child !== barcodeWrapper);
  removeLineGapOverrides(textItems);
  const textHeight = textItems.reduce((sum, child) => sum + child.offsetHeight, 0);
  const gapCount = textItems.length > 0 ? textItems.length : 0;
  const currentGapValue = parseCssNumber(style.rowGap || style.gap);
  const initialAvailable = contentHeight - textHeight - currentGapValue * gapCount;
  let appliedGapValue = currentGapValue;

  if (gapCount > 0 && Number.isFinite(initialAvailable) && initialAvailable < MIN_BARCODE_HEIGHT_PX) {
    const safeMaximumGapSpace = Math.max(
      contentHeight - textHeight - MIN_BARCODE_HEIGHT_PX,
      0,
    );
    const targetGap = Math.floor(safeMaximumGapSpace / gapCount);
    const normalizedGap = Number.isFinite(targetGap)
      ? Math.max(targetGap, 0)
      : 0;

    element.style.setProperty(
      LABEL_GAP_OVERRIDE_PROPERTY,
      `${normalizedGap}px`,
    );
    appliedGapValue = normalizedGap;
  } else {
    element.style.removeProperty(LABEL_GAP_OVERRIDE_PROPERTY);
    if (gapCount > 0) {
      const refreshedStyle = getComputedStyleFn(element);
      if (refreshedStyle) {
        appliedGapValue = parseCssNumber(refreshedStyle.rowGap || refreshedStyle.gap);
      }
    }
  }

  let effectiveTextHeight = textItems.reduce((sum, child) => sum + child.offsetHeight, 0);
  let available = contentHeight - effectiveTextHeight - appliedGapValue * gapCount;

  if (!Number.isFinite(available)) {
    return null;
  }

  if (textItems.length > 0 && available < MIN_BARCODE_HEIGHT_PX) {
    const targetTextSpace = Math.max(
      contentHeight - appliedGapValue * gapCount - MIN_BARCODE_HEIGHT_PX,
      0,
    );

    if (effectiveTextHeight > 0 && targetTextSpace < effectiveTextHeight) {
      const ratio = targetTextSpace / effectiveTextHeight;
      const compressed = applyLineGapCompression(
        textItems,
        Number.isFinite(ratio) ? ratio : 0,
        getComputedStyleFn,
      );

      if (compressed) {
        effectiveTextHeight = textItems.reduce(
          (sum, child) => sum + child.offsetHeight,
          0,
        );
        available = contentHeight - effectiveTextHeight - appliedGapValue * gapCount;
      }
    } else if (targetTextSpace <= 0) {
      const compressed = applyLineGapCompression(textItems, 0, getComputedStyleFn);
      if (compressed) {
        effectiveTextHeight = textItems.reduce(
          (sum, child) => sum + child.offsetHeight,
          0,
        );
        available = contentHeight - effectiveTextHeight - appliedGapValue * gapCount;
      }
    }
  }

  const normalizedAvailable = Math.max(Math.floor(available), MIN_BARCODE_HEIGHT_PX);

  return normalizedAvailable;
}

function adjustBarcodeHeightForElement(element, label) {
  if (!element || !label || !label.barcodeValue) {
    return false;
  }

  const baseHeight = computeBaseBarcodeHeightPx(label);
  const availableHeight = calculateBarcodeAvailableHeight(element, label);

  if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
    return false;
  }

  const barcodeClass = getBarcodeWrapperClass(element);
  const barcodeWrapper = element.querySelector(`.${barcodeClass}`);
  if (!barcodeWrapper) {
    return false;
  }

  const svg = barcodeWrapper.querySelector('svg');
  if (!svg) {
    return false;
  }

  const normalizedAvailableHeight = Math.max(
    Math.floor(availableHeight),
    MIN_BARCODE_HEIGHT_PX,
  );

  const targetHeight = Math.max(
    Math.min(baseHeight, normalizedAvailableHeight),
    MIN_BARCODE_HEIGHT_PX,
  );

  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    return false;
  }

  const roundedTargetHeight = Math.max(Math.floor(targetHeight), MIN_BARCODE_HEIGHT_PX);
  const roundedAvailableHeight = Math.max(normalizedAvailableHeight, MIN_BARCODE_HEIGHT_PX);

  barcodeWrapper.style.maxHeight = `${roundedAvailableHeight}px`;
  barcodeWrapper.style.setProperty('--barcode-available-height', `${roundedAvailableHeight}px`);

  const rendered = renderBarcode(
    svg,
    label.barcodeValue,
    getBarcodeRenderOptions(label, { heightPx: roundedTargetHeight }),
  );

  if (!rendered) {
    return false;
  }

  svg.style.height = `${roundedTargetHeight}px`;
  svg.style.maxHeight = `${roundedAvailableHeight}px`;
  svg.setAttribute('height', `${roundedTargetHeight}`);

  return true;
}

function adjustActivePreviewBarcode() {
  const previewLabel = previewContainer.querySelector('.preview-label');
  if (!previewLabel) {
    return;
  }

  const activeLabel = getActivePreviewLabel();
  if (!activeLabel) {
    return;
  }

  adjustBarcodeHeightForElement(previewLabel, activeLabel);
}

let pendingPreviewAdjustment = null;

function schedulePreviewBarcodeAdjustment() {
  if (typeof window === 'undefined') {
    adjustActivePreviewBarcode();
    return;
  }

  if (pendingPreviewAdjustment != null) {
    return;
  }

  const raf = window.requestAnimationFrame || window.setTimeout;
  pendingPreviewAdjustment = raf(() => {
    pendingPreviewAdjustment = null;
    adjustActivePreviewBarcode();
  });
}

function adjustBarcodeHeightsForElements(elements, labels) {
  if (!Array.isArray(elements) || !Array.isArray(labels)) {
    return;
  }

  const count = Math.min(elements.length, labels.length);
  for (let index = 0; index < count; index += 1) {
    adjustBarcodeHeightForElement(elements[index], labels[index]);
  }
}

function createPreviewLabel(label) {
  const element = document.createElement('div');
  element.className = 'preview-label';

  element.style.width = `${mmToPx(label.labelWidth)}px`;
  element.style.height = `${mmToPx(label.labelHeight)}px`;

  if (label.includeName) {
    const name = document.createElement('div');
    name.className = 'preview-label__name';
    name.style.fontSize = `${label.productFontSize}px`;
    name.textContent = label.productName;
    element.appendChild(name);

    if (label.subProductName) {
      const subName = document.createElement('div');
      subName.className = 'preview-label__subname';
      subName.style.fontSize = `${label.subProductFontSize}px`;
      subName.textContent = label.subProductName;
      element.appendChild(subName);
    }
  }

  const barcodeWrapper = document.createElement('div');
  barcodeWrapper.className = 'preview-label__barcode';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  barcodeWrapper.appendChild(svg);
  element.appendChild(barcodeWrapper);

  const hasBarcodeValue = Boolean(label.barcodeValue);

  if (hasBarcodeValue) {
    const rendered = renderBarcode(svg, label.barcodeValue, getBarcodeRenderOptions(label));

    if (!rendered) {
      barcodeWrapper.innerHTML = `<p class="label-preview__empty">바코드 스크립트를 불러오지 못했습니다.<br />인터넷 연결을 확인하거나 새로고침 후 다시 시도해주세요.</p>`;
    }
  } else {
    barcodeWrapper.innerHTML = '';
  }

  if (label.showText && hasBarcodeValue) {
    const barcodeText = document.createElement('div');
    barcodeText.className = 'preview-label__barcode-text';
    barcodeText.style.fontSize = `${label.barcodeFontSize}px`;
    barcodeText.textContent = label.barcodeValue;
    element.appendChild(barcodeText);
  }

  return element;
}

function renderPreview() {
  previewContainer.innerHTML = '';
  const { previewLabels, activeIndex, activeLabel } = computePreviewState();

  if (previewLabels.length === 0 || !activeLabel) {
    renderLabelList(null);
    renderPreviewPagination(previewLabels, activeIndex);
    previewContainer.style.removeProperty('--sheet-width');
    previewContainer.style.removeProperty('--sheet-height');
    previewContainer.style.minHeight = '';
    previewContainer.style.minWidth = '';
    previewContainer.innerHTML = `
      <div class="label-preview__empty">
        <p>왼쪽에서 라벨 정보를 추가하면 미리보기가 표시됩니다.</p>
        <p>원하는 수량과 크기를 자유롭게 조정해 보세요.</p>
      </div>
    `;
    return;
  }

  renderLabelList(activeLabel.id);
  renderPreviewPagination(previewLabels, activeIndex);

  const sheet = document.createElement('div');
  sheet.className = 'preview__sheet';

  const group = document.createElement('div');
  group.className = 'preview__group';
  group.style.gridTemplateColumns = `repeat(1, ${mmToPx(activeLabel.labelWidth)}px)`;
  group.style.columnGap = '0px';
  group.style.rowGap = '0px';

  const previewLabel = createPreviewLabel(activeLabel);
  group.appendChild(previewLabel);

  const sheetWidthPx = mmToPx(activeLabel.labelWidth);
  const sheetHeightPx = mmToPx(activeLabel.labelHeight);

  sheet.style.width = `${sheetWidthPx}px`;
  sheet.style.height = `${sheetHeightPx}px`;
  sheet.style.setProperty('--sheet-width', `${sheetWidthPx}px`);
  sheet.style.setProperty('--sheet-height', `${sheetHeightPx}px`);

  previewContainer.style.setProperty('--sheet-width', `${sheetWidthPx}px`);
  previewContainer.style.setProperty('--sheet-height', `${sheetHeightPx}px`);
  previewContainer.style.minHeight = `${sheetHeightPx}px`;
  previewContainer.style.minWidth = `${sheetWidthPx}px`;

  sheet.appendChild(group);

  previewContainer.appendChild(sheet);

  if (activeLabel.barcodeValue) {
    requestAnimationFrame(() => {
      adjustBarcodeHeightForElement(previewLabel, activeLabel);
    });
    schedulePreviewBarcodeAdjustment();
  }
}

function getPreviewLabelDescription(label, index, total) {
  if (!label) return '';

  if (state.editingLabelId && label.id === state.editingLabelId) {
    return label.productName ? `수정 중: ${label.productName}` : '수정 중인 라벨';
  }

  if (label.isDraft) {
    return label.productName ? `작성 중: ${label.productName}` : '작성 중인 라벨';
  }

  if (label.productName) {
    return label.productName;
  }

  if (label.barcodeValue) {
    return `바코드 ${label.barcodeValue}`;
  }

  return `라벨 ${index + 1}`;
}

function renderPreviewPagination(previewLabels, activeIndex) {
  if (!previewPagination) return;

  const total = previewLabels.length;

  if (total === 0) {
    previewPagination.classList.add('is-hidden');
    previewPagination.innerHTML = '';
    return;
  }

  previewPagination.classList.remove('is-hidden');

  const activeLabel = previewLabels[activeIndex] || null;
  const description = getPreviewLabelDescription(activeLabel, activeIndex, total);
  const pageIndicator = `${activeIndex + 1} / ${total}`;
  const labelText = description ? `${pageIndicator} · ${description}` : pageIndicator;

  previewPagination.innerHTML = '';

  const labelElement = document.createElement('div');
  labelElement.className = 'preview__pagination-label';
  labelElement.textContent = labelText;

  if (total === 1) {
    previewPagination.appendChild(labelElement);
    return;
  }

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.textContent = '이전';
  prevButton.setAttribute('aria-label', '이전 라벨 미리보기');
  prevButton.disabled = activeIndex === 0;
  prevButton.addEventListener('click', () => {
    if (state.activePreviewIndex > 0) {
      state.activePreviewIndex -= 1;
      renderPreview();
    }
  });

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.textContent = '다음';
  nextButton.setAttribute('aria-label', '다음 라벨 미리보기');
  nextButton.disabled = activeIndex >= total - 1;
  nextButton.addEventListener('click', () => {
    if (state.activePreviewIndex < total - 1) {
      state.activePreviewIndex += 1;
      renderPreview();
    }
  });

  const prevWrapper = document.createElement('div');
  prevWrapper.className = 'preview__pagination-controls';
  prevWrapper.appendChild(prevButton);

  const nextWrapper = document.createElement('div');
  nextWrapper.className = 'preview__pagination-controls';
  nextWrapper.appendChild(nextButton);

  previewPagination.appendChild(prevWrapper);
  previewPagination.appendChild(labelElement);
  previewPagination.appendChild(nextWrapper);
}

function mapBarcodeType(type) {
  switch (type) {
    case 'ean13':
      return 'EAN13';
    case 'code39':
      return 'CODE39';
    case 'itf14':
      return 'ITF14';
    default:
      return 'CODE128';
  }
}

function buildPrintSheet(labels) {
  const sheet = document.createElement('div');
  sheet.className = 'print-sheet';
  const labelElements = [];

  const pageSize = getPrintPageSizeFromLabels(labels, { warn: false });
  if (pageSize) {
    sheet.style.width = `${pageSize.width}mm`;
    sheet.style.minWidth = `${pageSize.width}mm`;
    sheet.style.maxWidth = `${pageSize.width}mm`;
    sheet.style.minHeight = `${pageSize.height}mm`;
  }

  labels.forEach((label) => {
    const group = document.createElement('div');
    group.className = 'print-sheet__group';
    group.style.display = 'grid';
    group.style.gridTemplateColumns = `${label.labelWidth}mm`;
    group.style.gap = '0';
    group.style.justifyItems = 'center';
    group.style.alignItems = 'center';
    group.style.minHeight = `${label.labelHeight}mm`;

    const item = document.createElement('div');
    item.className = 'print-label';
    item.style.width = `${label.labelWidth}mm`;
    item.style.height = `${label.labelHeight}mm`;

    if (label.includeName) {
      const name = document.createElement('div');
      name.className = 'print-label__name';
      name.style.fontSize = `${label.productFontSize}px`;
      name.textContent = label.productName;
      item.appendChild(name);

      if (label.subProductName) {
        const subName = document.createElement('div');
        subName.className = 'print-label__subname';
        subName.style.fontSize = `${label.subProductFontSize}px`;
        subName.textContent = label.subProductName;
        item.appendChild(subName);
      }
    }

    const barcodeWrapper = document.createElement('div');
    barcodeWrapper.className = 'print-label__barcode';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    barcodeWrapper.appendChild(svg);
    item.appendChild(barcodeWrapper);

    const rendered = renderBarcode(svg, label.barcodeValue, getBarcodeRenderOptions(label));

    if (!rendered) {
      barcodeWrapper.innerHTML = '<p>바코드 생성 오류</p>';
    }

    if (label.showText && label.barcodeValue) {
      const barcodeText = document.createElement('div');
      barcodeText.className = 'print-label__barcode-text';
      barcodeText.style.fontSize = `${label.barcodeFontSize}px`;
      barcodeText.textContent = label.barcodeValue;
      item.appendChild(barcodeText);
    }

    group.appendChild(item);

    sheet.appendChild(group);
    labelElements.push(item);
  });

  return { sheet, labelElements };
}

function getPrintableLabels() {
  const labels = getPreviewLabels();
  return labels.filter((label) => label && hasDraftContent(label));
}

let pdfLibLoadingPromise = null;
let fontkitLoadingPromise = null;
let pdfFontLoadingPromise = null;
let loadedFontkit = null;

function getLoadedPdfLib() {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  const library = globalThis.PDFLib;
  if (!library || !library.PDFDocument) {
    return null;
  }

  return library;
}

function getLoadedFontkit() {
  if (loadedFontkit) {
    return loadedFontkit;
  }

  if (typeof globalThis === 'undefined') {
    return null;
  }

  const { fontkit } = globalThis;
  if (!fontkit) {
    return null;
  }

  loadedFontkit = fontkit;
  return loadedFontkit;
}

function loadPdfLib() {
  const existing = getLoadedPdfLib();
  if (existing) {
    return Promise.resolve(existing);
  }

  if (!pdfLibLoadingPromise) {
    pdfLibLoadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDF_LIB_SOURCE_URL;
      script.async = true;
      script.onload = () => {
        const library = getLoadedPdfLib();
        if (library) {
          resolve(library);
          return;
        }

        reject(new Error('PDF 라이브러리를 초기화하지 못했습니다.'));
      };
      script.onerror = () => {
        reject(new Error('PDF 라이브러리를 불러오는 중 오류가 발생했습니다.'));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      pdfLibLoadingPromise = null;
      throw error;
    });
  }

  return pdfLibLoadingPromise;
}

function loadFontkit() {
  const existing = getLoadedFontkit();
  if (existing) {
    return Promise.resolve(existing);
  }

  if (!fontkitLoadingPromise) {
    fontkitLoadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDF_FONTKIT_SOURCE_URL;
      script.async = true;
      script.onload = () => {
        const library = getLoadedFontkit();
        if (library) {
          loadedFontkit = library;
          resolve(library);
          return;
        }

        reject(new Error('fontkit 라이브러리를 초기화하지 못했습니다.'));
      };
      script.onerror = () => {
        reject(new Error('fontkit 라이브러리를 불러오는 중 오류가 발생했습니다.'));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      fontkitLoadingPromise = null;
      throw error;
    });
  }

  return fontkitLoadingPromise.then((library) => {
    loadedFontkit = library;
    return library;
  });
}

async function ensureFontkitRegistered(pdfDoc) {
  if (!pdfDoc || typeof pdfDoc.registerFontkit !== 'function') {
    return;
  }

  const fontkit = await loadFontkit();
  if (!fontkit) {
    throw new Error('fontkit 라이브러리를 불러오지 못했습니다.');
  }

  pdfDoc.registerFontkit(fontkit);
}

function loadPdfFonts() {
  if (!pdfFontLoadingPromise) {
    const entries = Object.entries(PDF_FONT_SOURCE_URLS);

    pdfFontLoadingPromise = Promise.all(
      entries.map(async ([key, source]) => {
        const { url, fileName } =
          typeof source === 'string'
            ? { url: source, fileName: source.split('/').pop() || source }
            : source;

        const response = await fetch(url);

        if (!response.ok) {
          const missingHint =
            response.status === 404 && fileName
              ? ` (프로젝트의 vendor 폴더에 ${fileName} 파일이 존재하는지 확인해주세요.)`
              : '';
          throw new Error(`폰트(${key}) 파일을 불러오지 못했습니다.${missingHint}`);
        }

        const buffer = await response.arrayBuffer();
        return [key, new Uint8Array(buffer)];
      }),
    )
      .then((pairs) => Object.fromEntries(pairs))
      .catch((error) => {
        pdfFontLoadingPromise = null;
        throw error;
      });
  }

  return pdfFontLoadingPromise;
}

function dataUrlToUint8Array(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    return null;
  }

  const base64 = dataUrl.slice(commaIndex + 1);
  const binary = globalThis.atob ? globalThis.atob(base64) : null;
  if (!binary) {
    return null;
  }

  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function splitIntoLines(value) {
  if (typeof value !== 'string') {
    if (value == null) {
      return [];
    }

    return [`${value}`];
  }

  if (value === '') {
    return [''];
  }

  return value.split(/\r?\n/);
}

function drawCenteredTextBlock({
  page,
  lines,
  font,
  fontSizePx,
  color,
  cursorY,
  leftPaddingPt,
  usableWidthPt,
}) {
  const safeLines = Array.isArray(lines) && lines.length > 0 ? lines : [''];
  const baseFontSizePx = Number(fontSizePx);
  const safeFontSizePx = Number.isFinite(baseFontSizePx)
    ? Math.max(baseFontSizePx, 1)
    : 12;
  const sizePt = pxToPt(safeFontSizePx);
  const lineHeightPt = sizePt * LINE_HEIGHT_RATIO;
  let nextCursorY = cursorY;

  safeLines.forEach((line, index) => {
    const text = typeof line === 'string' ? line : `${line ?? ''}`;
    nextCursorY -= sizePt;

    const { width: textWidth, wordSpacing } = getPdfTextLayout({
      font,
      text,
      sizePt,
    });
    const centeredX = leftPaddingPt + Math.max((usableWidthPt - textWidth) / 2, 0);

    page.drawText(text, {
      x: centeredX,
      y: nextCursorY,
      size: sizePt,
      font,
      color,
      wordSpacing,
    });

    if (index < safeLines.length - 1) {
      nextCursorY -= lineHeightPt - sizePt;
    }
  });

  return nextCursorY;
}

function getPdfWordSpacing({ font, sizePt, text }) {
  if (!font || !Number.isFinite(sizePt) || sizePt <= 0) {
    return 0;
  }

  const spacesCount = countStandardSpaces(text);
  if (spacesCount === 0) {
    return 0;
  }

  const defaultSpaceWidth = font.widthOfTextAtSize(' ', sizePt);
  if (!Number.isFinite(defaultSpaceWidth) || defaultSpaceWidth <= 0) {
    return 0;
  }

  const defaultRatio = defaultSpaceWidth / sizePt;
  if (defaultRatio <= PDF_SPACE_WIDTH_ADJUST_THRESHOLD) {
    return 0;
  }

  const targetWidth = sizePt * PDF_SPACE_WIDTH_TARGET_RATIO;
  const spacing = targetWidth - defaultSpaceWidth;
  if (!Number.isFinite(spacing) || spacing >= 0) {
    return 0;
  }

  return spacing;
}

function getPdfTextLayout({ font, text, sizePt }) {
  if (!font || !Number.isFinite(sizePt) || sizePt <= 0) {
    return { width: 0, wordSpacing: 0 };
  }

  const baseWidth = font.widthOfTextAtSize(text, sizePt);
  const wordSpacing = getPdfWordSpacing({ font, sizePt, text });

  if (!Number.isFinite(baseWidth) || baseWidth <= 0 || wordSpacing === 0) {
    return {
      width: baseWidth,
      wordSpacing: 0,
    };
  }

  const spacesCount = countStandardSpaces(text);
  if (spacesCount === 0) {
    return {
      width: baseWidth,
      wordSpacing: 0,
    };
  }

  return {
    width: baseWidth + wordSpacing * spacesCount,
    wordSpacing,
  };
}

function countStandardSpaces(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return 0;
  }

  return (text.match(/ /g) || []).length;
}

function createBarcodeImageForPdf(label, widthPx, heightPx) {
  const JsBarcodeLibrary = getJsBarcode();
  if (!JsBarcodeLibrary || !label || !label.barcodeValue) {
    return null;
  }

  const safeWidth = Math.max(Math.floor(widthPx), 1);
  const safeHeight = Math.max(Math.floor(heightPx), MIN_BARCODE_HEIGHT_PX);
  const canvas = document.createElement('canvas');
  const scaledWidth = Math.max(Math.floor(safeWidth * BARCODE_CANVAS_SCALE), 1);
  const scaledHeight = Math.max(Math.floor(safeHeight * BARCODE_CANVAS_SCALE), 1);

  canvas.width = scaledWidth;
  canvas.height = scaledHeight;

  const context = canvas.getContext('2d');
  if (context && BARCODE_CANVAS_SCALE !== 1) {
    context.scale(BARCODE_CANVAS_SCALE, BARCODE_CANVAS_SCALE);
  }

  try {
    JsBarcodeLibrary(
      canvas,
      label.barcodeValue,
      {
        ...getBarcodeRenderOptions(label, { heightPx: safeHeight }),
        margin: 0,
      },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('PDF용 바코드 생성 중 오류가 발생했습니다.', error);
    return null;
  }

  const bytes = dataUrlToUint8Array(canvas.toDataURL('image/png'));
  if (!bytes) {
    return null;
  }

  return {
    bytes,
    width: canvas.width,
    height: canvas.height,
  };
}

async function drawBarcodeBlock({
  page,
  pdfDoc,
  label,
  cursorY,
  leftPaddingPt,
  usableWidthPt,
  fallbackFont,
  color,
}) {
  const includeBarcode = Boolean(label.barcodeValue);

  if (!includeBarcode) {
    return drawCenteredTextBlock({
      page,
      lines: ['바코드 생성 오류'],
      font: fallbackFont,
      fontSizePx: 12,
      color,
      cursorY,
      leftPaddingPt,
      usableWidthPt,
    });
  }

  const availableWidthMm = Math.max(Number(label.labelWidth) - LABEL_HORIZONTAL_PADDING_MM, 1);
  const availableWidthPx = Math.max(Math.round(mmToPx(availableWidthMm)), 1);
  const barcodeHeightPx = Math.max(Math.round(computeBaseBarcodeHeightPx(label)), MIN_BARCODE_HEIGHT_PX);
  const barcodeImage = createBarcodeImageForPdf(label, availableWidthPx, barcodeHeightPx);

  if (!barcodeImage) {
    return drawCenteredTextBlock({
      page,
      lines: ['바코드 생성 오류'],
      font: fallbackFont,
      fontSizePx: 12,
      color,
      cursorY,
      leftPaddingPt,
      usableWidthPt,
    });
  }

  const image = await pdfDoc.embedPng(barcodeImage.bytes);

  if (!image || image.width === 0 || image.height === 0) {
    return drawCenteredTextBlock({
      page,
      lines: ['바코드 생성 오류'],
      font: fallbackFont,
      fontSizePx: 12,
      color,
      cursorY,
      leftPaddingPt,
      usableWidthPt,
    });
  }

  const targetWidthPt = Math.max(usableWidthPt, 1);
  const targetHeightPt = pxToPt(barcodeHeightPx);
  const widthScale = targetWidthPt / image.width;
  const heightScale = targetHeightPt / image.height;
  const scale = Math.min(widthScale, heightScale);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = leftPaddingPt + Math.max((usableWidthPt - drawWidth) / 2, 0);
  const drawY = cursorY - drawHeight;

  page.drawImage(image, {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  });

  return drawY;
}

async function generateLabelsPdfBlob(labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return null;
  }

  const pdfLib = await loadPdfLib();
  if (!pdfLib) {
    throw new Error('PDF 라이브러리를 불러오지 못했습니다.');
  }

  const { PDFDocument, StandardFonts, rgb } = pdfLib;
  const pdfDoc = await PDFDocument.create();
  await ensureFontkitRegistered(pdfDoc);
  let fontRegularBytes = null;
  let fontBoldBytes = null;

  try {
    const loadedFonts = await loadPdfFonts();
    if (loadedFonts) {
      fontRegularBytes = loadedFonts.regular || null;
      fontBoldBytes = loadedFonts.bold || loadedFonts.regular || null;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('PDF 폰트를 불러오는 중 오류가 발생했습니다.', error);
    throw error;
  }

  // 부분 폰트 서브셋(subset)으로는 일부 한글 글자가 누락되는 경우가 있어
  // 전체 글리프를 포함하도록 설정합니다. 파일 용량은 조금 증가하지만 PDF
  // 내에서 글자가 빠지지 않도록 보장하는 것이 우선입니다.
  const fontEmbedOptions = { subset: false };
  const fontRegular = fontRegularBytes
    ? await pdfDoc.embedFont(fontRegularBytes, fontEmbedOptions)
    : await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = fontBoldBytes
    ? await pdfDoc.embedFont(fontBoldBytes, fontEmbedOptions)
    : fontRegular;

  const colors = {
    dark: rgb(17 / 255, 24 / 255, 39 / 255),
    black: rgb(0, 0, 0),
  };

  for (const label of labels) {
    if (!label) {
      continue;
    }

    const widthMm = Number(label.labelWidth);
    const heightMm = Number(label.labelHeight);

    if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
      continue;
    }

    const pageWidthPt = mmToPt(widthMm);
    const pageHeightPt = mmToPt(heightMm);
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

    const verticalPaddingPt = mmToPt(LABEL_VERTICAL_PADDING_MM / 2);
    const horizontalPaddingPt = mmToPt(LABEL_HORIZONTAL_PADDING_MM / 2);
    const gapPt = mmToPt(LABEL_GAP_MM);
    const usableWidthPt = Math.max(pageWidthPt - horizontalPaddingPt * 2, 1);

    let cursorY = pageHeightPt - verticalPaddingPt;

    const blocks = [];

    if (label.includeName) {
      const productLines = splitIntoLines(label.productName);
      blocks.push({
        type: 'text',
        lines: productLines,
        font: fontBold,
        fontSizePx: Number(label.productFontSize) || 16,
        color: colors.dark,
      });

      if (label.subProductName) {
        const subLines = splitIntoLines(label.subProductName);
        blocks.push({
          type: 'text',
          lines: subLines,
          font: fontRegular,
          fontSizePx: Number(label.subProductFontSize) || 14,
          color: colors.black,
        });
      }
    }

    blocks.push({ type: 'barcode' });

    if (label.showText && label.barcodeValue) {
      blocks.push({
        type: 'text',
        lines: [label.barcodeValue],
        font: fontBold,
        fontSizePx: Number(label.barcodeFontSize) || 12,
        color: colors.dark,
      });
    }

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];

      if (!block) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (block.type === 'text') {
        cursorY = drawCenteredTextBlock({
          page,
          lines: block.lines,
          font: block.font,
          fontSizePx: block.fontSizePx,
          color: block.color,
          cursorY,
          leftPaddingPt: horizontalPaddingPt,
          usableWidthPt,
        });
      } else if (block.type === 'barcode') {
        cursorY = await drawBarcodeBlock({
          page,
          pdfDoc,
          label,
          cursorY,
          leftPaddingPt: horizontalPaddingPt,
          usableWidthPt,
          fallbackFont: fontBold,
          color: colors.dark,
        });
      }

      if (index < blocks.length - 1) {
        cursorY -= gapPt;
      }
    }
  }

  if (pdfDoc.getPageCount() === 0) {
    return null;
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

function createDownloadFilename() {
  const now = new Date();
  const iso = now.toISOString().replace(/[:.]/g, '-');
  return `barcode-labels-${iso}.pdf`;
}

function openSystemPrintDialog({ emptyMessage }) {
  const printableLabels = getPrintableLabels();

  if (printableLabels.length === 0) {
    if (emptyMessage) {
      alert(emptyMessage);
    }
    return false;
  }

  applyPrintPageSizeFromLabels(printableLabels);

  printRoot.innerHTML = '';
  const { sheet, labelElements } = buildPrintSheet(printableLabels);
  printRoot.appendChild(sheet);
  printRoot.setAttribute('data-printing', 'true');

  requestAnimationFrame(() => {
    adjustBarcodeHeightsForElements(labelElements, printableLabels);
    requestAnimationFrame(() => {
      window.print();
    });
  });

  return true;
}

function handlePrint() {
  openSystemPrintDialog({
    emptyMessage: '인쇄할 라벨이 없습니다. 먼저 라벨을 추가해주세요.',
  });
}

async function handleDownloadPdf(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  const printableLabels = getPrintableLabels();

  if (printableLabels.length === 0) {
    alert('다운로드할 라벨이 없습니다. 먼저 라벨을 추가해주세요.');
    return;
  }

  if (downloadButton) {
    downloadButton.disabled = true;
    downloadButton.setAttribute('aria-busy', 'true');
  }

  try {
    const pdfBlob = await generateLabelsPdfBlob(printableLabels);

    if (!pdfBlob) {
      alert('PDF를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const downloadUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = createDownloadFilename();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 0);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('PDF 생성 중 오류가 발생했습니다.', error);
    const message =
      error && typeof error.message === 'string'
        ? error.message
        : '';
    if (message.includes('폰트') && message.includes('vendor')) {
      alert(
        `${message}\n\n필요한 폰트 파일이 프로젝트의 vendor 폴더에 있는지 확인한 뒤 다시 시도해주세요.`,
      );
    } else {
      alert('PDF 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  } finally {
    if (downloadButton) {
      downloadButton.disabled = false;
      downloadButton.removeAttribute('aria-busy');
    }
  }
}

function updateDraft() {
  const rawValues = getFormValues();
  const formValues = withFallbacks(rawValues);

  const hasContent = hasDraftContent(formValues);

  persistPreferences(formValues);

  persistFormState(hasContent ? formValues : null);

  if (!hasContent) {
    state.draft = null;
    renderPreview();
    return;
  }

  if (state.editingLabelId) {
    state.draft = {
      ...formValues,
      id: state.editingLabelId,
      isDraft: true,
      isEditing: true,
    };

    const previewLabels = getPreviewLabels();
    const index = previewLabels.findIndex((label) => label.id === state.editingLabelId);
    if (index !== -1) {
      state.activePreviewIndex = index;
    }
  } else {
    state.draft = {
      ...formValues,
      id: 'draft',
      isDraft: true,
    };

    const previewLabels = getPreviewLabels();
    state.activePreviewIndex = previewLabels.length - 1;
  }

  renderPreview();
}

function handleFormChange() {
  if (isResettingForm) return;
  updateDraft();
}

function init() {
  applyPreferencesFromStorage();
  restoreLabels();
  renderPreview();

  const restoredFormValues = restoreFormState();

  form.addEventListener('submit', handleFormSubmit);
  resetButton.addEventListener('click', resetLabels);
  form.addEventListener('input', handleFormChange);
  form.addEventListener('change', handleFormChange);
  form.addEventListener('reset', () => {
    state.draft = null;
    state.editingLabelId = null;
    updateFormEditingState();
    renderPreview();
    requestAnimationFrame(() => {
      persistFormState(null);
      applyPreferencesFromStorage();
    });
  });
  if (completeEditButton) {
    completeEditButton.addEventListener('click', () => {
      if (!state.editingLabelId) {
        return;
      }

      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return;
      }

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);
    });
  }
  printButton.addEventListener('click', handlePrint);
  if (downloadButton) {
    downloadButton.addEventListener('click', handleDownloadPdf);
  }

  if (restoredFormValues && hasDraftContent(restoredFormValues)) {
    updateDraft();
  }

  updateFormEditingState();

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', schedulePreviewBarcodeAdjustment);
  }

  if (document && document.fonts) {
    const { fonts } = document;

    if (typeof fonts.addEventListener === 'function') {
      fonts.addEventListener('loadingdone', schedulePreviewBarcodeAdjustment);
      fonts.addEventListener('loadingerror', schedulePreviewBarcodeAdjustment);
    }

    if (fonts.ready && typeof fonts.ready.then === 'function') {
      fonts.ready
        .then(() => {
          schedulePreviewBarcodeAdjustment();
        })
        .catch(() => {
          schedulePreviewBarcodeAdjustment();
        });
    }
  }
}

window.addEventListener('beforeprint', () => {
  const printableLabels = getPrintableLabels();
  if (printableLabels.length === 0) return;

  applyPrintPageSizeFromLabels(printableLabels);

  if (printRoot.childElementCount === 0) {
    const { sheet, labelElements } = buildPrintSheet(printableLabels);
    printRoot.appendChild(sheet);
    adjustBarcodeHeightsForElements(labelElements, printableLabels);
    requestAnimationFrame(() => {
      adjustBarcodeHeightsForElements(labelElements, printableLabels);
    });
  } else {
    const existingElements = Array.from(printRoot.querySelectorAll('.print-label'));
    if (existingElements.length > 0) {
      adjustBarcodeHeightsForElements(existingElements, printableLabels);
      requestAnimationFrame(() => {
        adjustBarcodeHeightsForElements(existingElements, printableLabels);
      });
    }
  }

  printRoot.setAttribute('data-printing', 'true');
});

window.addEventListener('afterprint', () => {
  printRoot.innerHTML = '';
  printRoot.removeAttribute('data-printing');
  removePrintPageSize();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
