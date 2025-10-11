const form = document.getElementById('label-form');
const labelList = document.getElementById('label-list');
const previewContainer = document.getElementById('label-preview');
const resetButton = document.getElementById('reset-button');
const printButton = document.getElementById('print-button');
const printRoot = document.getElementById('print-root');

const STORAGE_KEYS = {
  labels: 'barcode-maker:labels',
  form: 'barcode-maker:form',
};

const MAX_HORIZONTAL_OFFSET = 60;

const state = {
  labels: [],
  draft: null,
};

let isResettingForm = false;

const MM_TO_PX = 96 / 25.4;
const PREVIEW_PADDING_MM = 10;
const PREVIEW_GROUP_GAP_MM = 6;

function mmToPx(mm) {
  return mm * MM_TO_PX;
}

function getJsBarcode() {
  if (typeof globalThis === 'undefined') return null;
  const library = globalThis.JsBarcode;
  return typeof library === 'function' ? library : null;
}

function renderBarcode(svg, value, options) {
  const JsBarcodeLibrary = getJsBarcode();
  if (!JsBarcodeLibrary) {
    return false;
  }

  try {
    JsBarcodeLibrary(svg, value, options);
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
    horizontalOffset: Number(formData.get('horizontalOffset')),
    verticalOffset: Number(formData.get('verticalOffset')),
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
    horizontalOffset: Number(form.elements.horizontalOffset?.defaultValue) || 0,
    verticalOffset: Number(form.elements.verticalOffset?.defaultValue) || 0,
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
    horizontalOffset: normalizeNumber(values.horizontalOffset, {
      min: 0,
      max: MAX_HORIZONTAL_OFFSET,
      fallback: defaults.horizontalOffset,
    }),
    verticalOffset: normalizeNumber(values.verticalOffset, {
      min: 0,
      fallback: defaults.verticalOffset,
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
            horizontalOffset: Number(item.horizontalOffset),
            verticalOffset: Number(item.verticalOffset),
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

    if (typeof parsed.productName === 'string') {
      form.elements.productName.value = parsed.productName;
    }
    if (typeof parsed.subProductName === 'string') {
      form.elements.subProductName.value = parsed.subProductName;
    }
    if (typeof parsed.barcodeValue === 'string') {
      form.elements.barcodeValue.value = parsed.barcodeValue;
    }
    if (typeof parsed.productFontSize === 'number') {
      form.elements.productFontSize.value = parsed.productFontSize;
    }
    if (typeof parsed.subProductFontSize === 'number') {
      form.elements.subProductFontSize.value = parsed.subProductFontSize;
    }
    if (typeof parsed.barcodeFontSize === 'number') {
      form.elements.barcodeFontSize.value = parsed.barcodeFontSize;
    }
    if (typeof parsed.labelWidth === 'number') {
      form.elements.labelWidth.value = parsed.labelWidth;
    }
    if (typeof parsed.labelHeight === 'number') {
      form.elements.labelHeight.value = parsed.labelHeight;
    }
    if (typeof parsed.horizontalOffset === 'number') {
      form.elements.horizontalOffset.value = parsed.horizontalOffset;
    }
    if (typeof parsed.verticalOffset === 'number') {
      form.elements.verticalOffset.value = parsed.verticalOffset;
    }
    if (typeof parsed.barcodeType === 'string') {
      form.elements.barcodeType.value = parsed.barcodeType;
    }
    if (typeof parsed.showText === 'boolean') {
      form.elements.showText.checked = parsed.showText;
    }
    if (typeof parsed.includeName === 'boolean') {
      form.elements.includeName.checked = parsed.includeName;
    }

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

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn label-list__remove';
  removeButton.textContent = '삭제';
  removeButton.addEventListener('click', () => {
    removeLabel(label.id);
  });

  wrapper.appendChild(info);
  wrapper.appendChild(meta);
  wrapper.appendChild(removeButton);

  return wrapper;
}

function renderLabelList() {
  labelList.innerHTML = '';
  if (state.labels.length === 0) {
    labelList.innerHTML = '<p class="label-preview__empty">추가된 라벨이 없습니다.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  state.labels.forEach((label) => {
    fragment.appendChild(createLabelEntry(label));
  });
  labelList.appendChild(fragment);
}

function handleFormSubmit(event) {
  event.preventDefault();
  const rawValues = getFormValues();
  const formValues = withFallbacks(rawValues);

  if (
    rawValues.horizontalOffset > MAX_HORIZONTAL_OFFSET &&
    formValues.horizontalOffset === MAX_HORIZONTAL_OFFSET
  ) {
    alert('더 이상 추가할 수 없습니다');
    form.elements.horizontalOffset.value = MAX_HORIZONTAL_OFFSET;
  }

  const label = {
    id: generateId(),
    ...formValues,
  };

  if (!label.productName || !label.barcodeValue) {
    alert('상품명과 바코드 값은 필수 입력 항목입니다.');
    return;
  }

  state.labels.push(label);
  state.draft = null;
  persistLabels();
  renderLabelList();
  renderPreview();

  isResettingForm = true;
  form.reset();
  isResettingForm = false;
}

function removeLabel(id) {
  state.labels = state.labels.filter((label) => label.id !== id);
  persistLabels();
  renderLabelList();
  renderPreview();
}

function resetLabels() {
  if (state.labels.length === 0) return;
  if (confirm('모든 라벨을 삭제할까요?')) {
    state.labels = [];
    persistLabels();
    renderLabelList();
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
    'horizontalOffset',
    'verticalOffset',
  ];

  return keys.every((key) => a[key] === b[key]);
}

function getPreviewLabels() {
  const labels = [...state.labels];
  if (state.draft && hasDraftContent(state.draft)) {
    const isDuplicate = labels.some((label) => areLabelsEqual(label, state.draft));
    if (!isDuplicate) {
      labels.push(state.draft);
    }
  }
  return labels;
}

function createPreviewLabel(label) {
  const element = document.createElement('div');
  element.className = 'preview-label';

  const basePaddingPx = mmToPx(3);
  const horizontalPaddingPx = basePaddingPx + label.horizontalOffset;
  const verticalGapPx = Math.max(0, mmToPx(2.4) - label.verticalOffset);
  const nameMarginPx = Math.max(0, mmToPx(2) - label.verticalOffset);

  element.style.width = `${mmToPx(label.labelWidth)}px`;
  element.style.height = `${mmToPx(label.labelHeight)}px`;
  element.style.padding = `${basePaddingPx}px`;
  element.style.paddingLeft = `${horizontalPaddingPx}px`;
  element.style.paddingRight = `${horizontalPaddingPx}px`;
  element.style.gap = `${verticalGapPx}px`;

  if (label.includeName) {
    const name = document.createElement('div');
    name.className = 'preview-label__name';
    name.style.fontSize = `${label.productFontSize}px`;
    name.style.marginBottom = `${nameMarginPx}px`;
    name.textContent = label.productName;
    element.appendChild(name);

    if (label.subProductName) {
      const subName = document.createElement('div');
      subName.className = 'preview-label__subname';
      subName.style.fontSize = `${label.subProductFontSize}px`;
      subName.style.marginBottom = `${nameMarginPx}px`;
      subName.textContent = label.subProductName;
      element.appendChild(subName);
    }
  }

  const barcodeWrapper = document.createElement('div');
  barcodeWrapper.className = 'preview-label__barcode';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  barcodeWrapper.appendChild(svg);
  element.appendChild(barcodeWrapper);

  if (label.barcodeValue) {
    const rendered = renderBarcode(svg, label.barcodeValue, {
      format: mapBarcodeType(label.barcodeType),
      displayValue: label.showText,
      fontSize: label.barcodeFontSize,
      height: label.labelHeight * 2.2,
      margin: 0,
    });

    if (!rendered) {
      barcodeWrapper.innerHTML = `<p class="label-preview__empty">바코드 스크립트를 불러오지 못했습니다.<br />인터넷 연결을 확인하거나 새로고침 후 다시 시도해주세요.</p>`;
    }
  } else {
    barcodeWrapper.innerHTML =
      '<p class="label-preview__empty">바코드 값을 입력하면 미리보기를 확인할 수 있습니다.</p>';
  }

  return element;
}

function renderPreview() {
  previewContainer.innerHTML = '';
  const previewLabels = getPreviewLabels();

  if (previewLabels.length === 0) {
    previewContainer.innerHTML = `
      <div class="label-preview__empty">
        <p>왼쪽에서 라벨 정보를 추가하면 미리보기가 표시됩니다.</p>
        <p>원하는 수량과 크기를 자유롭게 조정해 보세요.</p>
      </div>
    `;
    return;
  }

  const sheet = document.createElement('div');
  sheet.className = 'preview__sheet';
  sheet.style.padding = `${mmToPx(PREVIEW_PADDING_MM)}px`;

  let maxContentWidthMm = 0;
  let totalContentHeightMm = 0;

  previewLabels.forEach((label, index) => {
    const group = document.createElement('div');
    group.className = 'preview__group';
    group.style.gridTemplateColumns = `repeat(1, ${mmToPx(label.labelWidth)}px)`;
    group.style.columnGap = '0px';
    group.style.rowGap = '0px';

    const previewLabel = createPreviewLabel(label);
    group.appendChild(previewLabel);

    maxContentWidthMm = Math.max(maxContentWidthMm, label.labelWidth);
    totalContentHeightMm += label.labelHeight;
    if (index < previewLabels.length - 1) {
      totalContentHeightMm += PREVIEW_GROUP_GAP_MM;
    }

    sheet.appendChild(group);
  });

  const totalWidthMm = maxContentWidthMm + PREVIEW_PADDING_MM * 2;
  const totalHeightMm = totalContentHeightMm + PREVIEW_PADDING_MM * 2;

  const sheetWidthPx = mmToPx(totalWidthMm);
  const sheetHeightPx = mmToPx(totalHeightMm);

  sheet.style.width = `${sheetWidthPx}px`;
  sheet.style.minWidth = `${sheetWidthPx}px`;
  sheet.style.minHeight = `${sheetHeightPx}px`;
  sheet.style.gap = `${mmToPx(PREVIEW_GROUP_GAP_MM)}px`;

  previewContainer.appendChild(sheet);
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

  labels.forEach((label) => {
    const group = document.createElement('div');
    group.className = 'print-sheet__group';
    group.style.display = 'grid';
    group.style.gridTemplateColumns = `${label.labelWidth}mm`;
    group.style.gap = '0';

    const item = document.createElement('div');
    item.className = 'print-label';
    item.style.width = `${label.labelWidth}mm`;
    item.style.height = `${label.labelHeight}mm`;
    item.style.setProperty('--horizontal-offset', `${label.horizontalOffset}px`);
    item.style.setProperty('--vertical-offset', `${label.verticalOffset}px`);

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

    const rendered = renderBarcode(svg, label.barcodeValue, {
      format: mapBarcodeType(label.barcodeType),
      displayValue: label.showText,
      fontSize: label.barcodeFontSize,
      height: label.labelHeight * 2.2,
      margin: 0,
    });

    if (!rendered) {
      barcodeWrapper.innerHTML = '<p>바코드 생성 오류</p>';
    }

    group.appendChild(item);

    sheet.appendChild(group);
  });

  return sheet;
}

function handlePrint() {
  if (state.labels.length === 0) {
    alert('인쇄할 라벨이 없습니다. 먼저 라벨을 추가해주세요.');
    return;
  }

  printRoot.innerHTML = '';
  const sheet = buildPrintSheet(state.labels);
  printRoot.appendChild(sheet);
  printRoot.setAttribute('data-printing', 'true');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}

function updateDraft() {
  const rawValues = getFormValues();
  const formValues = withFallbacks(rawValues);

  if (
    rawValues.horizontalOffset > MAX_HORIZONTAL_OFFSET &&
    formValues.horizontalOffset === MAX_HORIZONTAL_OFFSET
  ) {
    alert('더 이상 추가할 수 없습니다');
    form.elements.horizontalOffset.value = MAX_HORIZONTAL_OFFSET;
  }

  const hasContent = hasDraftContent(formValues);

  persistFormState(hasContent ? formValues : null);

  if (!hasContent) {
    state.draft = null;
    renderPreview();
    return;
  }

  state.draft = {
    ...formValues,
    id: 'draft',
    isDraft: true,
  };

  renderPreview();
}

function handleFormChange() {
  if (isResettingForm) return;
  updateDraft();
}

function init() {
  restoreLabels();
  renderLabelList();
  renderPreview();

  const restoredFormValues = restoreFormState();

  form.addEventListener('submit', handleFormSubmit);
  resetButton.addEventListener('click', resetLabels);
  form.addEventListener('input', handleFormChange);
  form.addEventListener('change', handleFormChange);
  form.addEventListener('reset', () => {
    state.draft = null;
    renderPreview();
    requestAnimationFrame(() => {
      persistFormState(null);
    });
  });
  printButton.addEventListener('click', handlePrint);

  if (restoredFormValues && hasDraftContent(restoredFormValues)) {
    state.draft = {
      ...withFallbacks(restoredFormValues),
      id: 'draft',
      isDraft: true,
    };
    renderPreview();
  }
}

window.addEventListener('beforeprint', () => {
  if (state.labels.length === 0) return;

  if (printRoot.childElementCount === 0) {
    const sheet = buildPrintSheet(state.labels);
    printRoot.appendChild(sheet);
  }

  printRoot.setAttribute('data-printing', 'true');
});

window.addEventListener('afterprint', () => {
  printRoot.innerHTML = '';
  printRoot.removeAttribute('data-printing');
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
