const form = document.getElementById('label-form');
const labelList = document.getElementById('label-list');
const previewContainer = document.getElementById('label-preview');
const resetButton = document.getElementById('reset-button');
const printButton = document.getElementById('print-button');
const printRoot = document.getElementById('print-root');

const state = {
  labels: [],
  draft: null,
};

let isResettingForm = false;

function getFormValues() {
  const formData = new FormData(form);

  return {
    productName: (formData.get('productName') || '').trim(),
    barcodeValue: (formData.get('barcodeValue') || '').trim(),
    quantity: Number(formData.get('quantity')),
    barcodeType: formData.get('barcodeType') || 'code128',
    fontSize: Number(formData.get('fontSize')),
    labelWidth: Number(formData.get('labelWidth')),
    labelHeight: Number(formData.get('labelHeight')),
    columns: Number(formData.get('columns')),
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
    quantity: Number(form.elements.quantity?.defaultValue) || 1,
    fontSize: Number(form.elements.fontSize?.defaultValue) || 14,
    labelWidth: Number(form.elements.labelWidth?.defaultValue) || 60,
    labelHeight: Number(form.elements.labelHeight?.defaultValue) || 40,
    columns: Number(form.elements.columns?.defaultValue) || 1,
  };
}

function withFallbacks(values) {
  const defaults = getDefaults();

  return {
    ...values,
    quantity: normalizeNumber(values.quantity, {
      min: 1,
      max: 200,
      fallback: defaults.quantity,
    }),
    fontSize: normalizeNumber(values.fontSize, {
      min: 10,
      max: 24,
      fallback: defaults.fontSize,
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
    columns: normalizeNumber(values.columns, {
      min: 1,
      max: 4,
      fallback: defaults.columns,
    }),
  };
}

function createLabelEntry(label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'label-list__item';

  const name = document.createElement('strong');
  name.textContent = `${label.productName} (${label.barcodeValue})`;

  const meta = document.createElement('div');
  meta.className = 'label-list__meta';
  meta.innerHTML = `
    <span>수량 ${label.quantity}매</span>
    <span>${label.labelWidth} × ${label.labelHeight} mm</span>
  `;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn label-list__remove';
  removeButton.textContent = '삭제';
  removeButton.addEventListener('click', () => {
    removeLabel(label.id);
  });

  wrapper.appendChild(name);
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
  const formValues = getFormValues();

  const label = {
    id: crypto.randomUUID(),
    ...formValues,
  };

  if (!label.productName || !label.barcodeValue) {
    alert('상품명과 바코드 값은 필수 입력 항목입니다.');
    return;
  }

  if (Number.isNaN(label.quantity) || label.quantity < 1) {
    alert('수량은 1 이상의 숫자여야 합니다.');
    return;
  }

  state.labels.push(label);
  state.draft = null;
  renderLabelList();
  renderPreview();

  isResettingForm = true;
  form.reset();
  isResettingForm = false;
}

function removeLabel(id) {
  state.labels = state.labels.filter((label) => label.id !== id);
  renderLabelList();
  renderPreview();
}

function resetLabels() {
  if (state.labels.length === 0) return;
  if (confirm('모든 라벨을 삭제할까요?')) {
    state.labels = [];
    renderLabelList();
    renderPreview();
  }
}

function getPreviewLabels() {
  const labels = [...state.labels];
  if (state.draft) {
    labels.push(state.draft);
  }
  return labels;
}

function renderDraftBadge(card) {
  const badge = document.createElement('span');
  badge.className = 'label-card__badge';
  badge.textContent = '작성 중';
  card.appendChild(badge);
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

  const grid = document.createElement('div');
  grid.className = 'label-preview__grid';
  grid.dataset.columns = Math.max(
    ...previewLabels.map((label) => Math.max(1, Math.min(label.columns || 1, 4))),
  );

  previewLabels.forEach((label) => {
    const card = document.createElement('div');
    card.className = 'label-card';
    card.style.minHeight = `${label.labelHeight * 2.5}px`;

    if (label.isDraft) {
      card.classList.add('label-card--draft');
      renderDraftBadge(card);
    }

    if (label.includeName) {
      const name = document.createElement('div');
      name.className = 'label-card__name';
      name.textContent = label.productName;
      card.appendChild(name);
    }

    const barcodeContainer = document.createElement('div');
    barcodeContainer.className = 'label-card__barcode';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    barcodeContainer.appendChild(svg);
    card.appendChild(barcodeContainer);

    if (label.barcodeValue) {
      try {
        JsBarcode(svg, label.barcodeValue, {
          format: mapBarcodeType(label.barcodeType),
          height: label.labelHeight * 1.6,
          width: 2,
          displayValue: label.showText,
          fontSize: label.fontSize,
          margin: 4,
        });
      } catch (error) {
        barcodeContainer.innerHTML = `<p class="label-preview__empty">바코드 생성에 실패했습니다.<br />입력 값을 확인해주세요.</p>`;
      }
    } else {
      barcodeContainer.innerHTML =
        '<p class="label-preview__empty">바코드 값을 입력하면 미리보기를 확인할 수 있습니다.</p>';
    }

    const meta = document.createElement('div');
    meta.className = 'label-list__meta';
    const metaInfo = [`${label.quantity}매 출력`, `${label.labelWidth} × ${label.labelHeight}mm`];
    if (label.isDraft) {
      metaInfo.push('작성 중 라벨');
    }
    meta.innerHTML = metaInfo.map((text) => `<span>${text}</span>`).join('');
    card.appendChild(meta);

    grid.appendChild(card);
  });

  previewContainer.appendChild(grid);
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
    const columns = Math.min(Math.max(label.columns, 1), 4);
    const group = document.createElement('div');
    group.className = 'print-sheet__group';
    group.style.display = 'grid';
    group.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    group.style.gap = '0';

    for (let i = 0; i < label.quantity; i += 1) {
      const item = document.createElement('div');
      item.className = 'print-label';
      item.style.width = `${label.labelWidth}mm`;
      item.style.height = `${label.labelHeight}mm`;

      if (label.includeName) {
        const name = document.createElement('div');
        name.className = 'print-label__name';
        name.style.fontSize = `${label.fontSize}px`;
        name.textContent = label.productName;
        item.appendChild(name);
      }

      const barcodeWrapper = document.createElement('div');
      barcodeWrapper.className = 'print-label__barcode';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      barcodeWrapper.appendChild(svg);
      item.appendChild(barcodeWrapper);

      try {
        JsBarcode(svg, label.barcodeValue, {
          format: mapBarcodeType(label.barcodeType),
          displayValue: label.showText,
          fontSize: label.fontSize,
          height: label.labelHeight * 2.2,
          margin: 0,
        });
      } catch (error) {
        barcodeWrapper.innerHTML = '<p>바코드 생성 오류</p>';
      }

      group.appendChild(item);
    }

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

  requestAnimationFrame(() => {
    window.print();
  });
}

function updateDraft() {
  const formValues = withFallbacks(getFormValues());
  const hasContent = Boolean(formValues.productName || formValues.barcodeValue);

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
  form.addEventListener('submit', handleFormSubmit);
  resetButton.addEventListener('click', resetLabels);
  form.addEventListener('input', handleFormChange);
  form.addEventListener('change', handleFormChange);
  form.addEventListener('reset', () => {
    state.draft = null;
    renderPreview();
  });
  printButton.addEventListener('click', handlePrint);
  renderLabelList();
  renderPreview();
}

window.addEventListener('afterprint', () => {
  printRoot.innerHTML = '';
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
