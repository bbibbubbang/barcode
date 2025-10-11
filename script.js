const form = document.getElementById('label-form');
const labelList = document.getElementById('label-list');
const previewContainer = document.getElementById('label-preview');
const resetButton = document.getElementById('reset-button');
const generateButton = document.getElementById('generate-button');
const printButton = document.getElementById('print-button');

const state = {
  labels: [],
};

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
  const formData = new FormData(form);

  const label = {
    id: crypto.randomUUID(),
    productName: formData.get('productName').trim(),
    barcodeValue: formData.get('barcodeValue').trim(),
    quantity: Number(formData.get('quantity')),
    barcodeType: formData.get('barcodeType'),
    fontSize: Number(formData.get('fontSize')),
    labelWidth: Number(formData.get('labelWidth')),
    labelHeight: Number(formData.get('labelHeight')),
    columns: Number(formData.get('columns')),
    showText: formData.get('showText') === 'on',
    includeName: formData.get('includeName') === 'on',
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
  renderLabelList();
  renderPreview();
  form.reset();
  form.elements.quantity.value = 10;
  form.elements.fontSize.value = 14;
  form.elements.labelWidth.value = 60;
  form.elements.labelHeight.value = 40;
  form.elements.columns.value = 3;
  form.elements.showText.checked = true;
  form.elements.includeName.checked = true;
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

function renderPreview() {
  previewContainer.innerHTML = '';
  if (state.labels.length === 0) {
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
  grid.dataset.columns = Math.max(...state.labels.map((label) => label.columns));

  state.labels.forEach((label) => {
    const card = document.createElement('div');
    card.className = 'label-card';
    card.style.minHeight = `${label.labelHeight * 2.5}px`;

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

    const meta = document.createElement('div');
    meta.className = 'label-list__meta';
    meta.innerHTML = `<span>${label.quantity}매 출력</span><span>${label.labelWidth} × ${label.labelHeight}mm</span>`;
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

function buildPrintSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'print-sheet';

  state.labels.forEach((label) => {
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

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('팝업 차단을 해제한 뒤 다시 시도해주세요.');
    return;
  }

  const sheet = buildPrintSheet();
  const styles = document.createElement('style');
  styles.textContent = `
    @page { margin: 0; }
    body { margin: 0; font-family: 'Inter', sans-serif; }
    .print-sheet { display: grid; gap: 6mm; width: 100vw; padding: 10mm; box-sizing: border-box; }
    .print-sheet__group { break-inside: avoid; display: grid; gap: 0; }
    .print-label { display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 3mm; }
    .print-label__name { font-weight: 600; margin-bottom: 2mm; text-align: center; }
    .print-label__barcode svg { width: 100%; height: auto; }
  `;

  printWindow.document.head.appendChild(styles);
  printWindow.document.body.appendChild(sheet);
  printWindow.addEventListener('load', () => {
    printWindow.focus();
    printWindow.print();
  });
}

function init() {
  form.addEventListener('submit', handleFormSubmit);
  resetButton.addEventListener('click', resetLabels);
  generateButton.addEventListener('click', renderPreview);
  printButton.addEventListener('click', handlePrint);
  renderLabelList();
  renderPreview();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
