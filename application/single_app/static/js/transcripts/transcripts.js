(function () {
  const config = window.transcriptsConfig || {};
  const tableBody = document.getElementById('transcripts-table-body');
  const tableWrapper = document.getElementById('transcripts-table-wrapper');
  const errorAlert = document.getElementById('transcripts-error');
  const uploadForm = document.getElementById('transcript-upload-form');
  const fileInput = document.getElementById('transcript-file-input');
  const uploadStatus = document.getElementById('transcript-upload-status');
  const refreshBtn = document.getElementById('refresh-transcripts-btn');
  const emptyState = document.getElementById('transcripts-empty-state');
  const modalElement = document.getElementById('transcriptModal');
  const modalTitle = document.getElementById('transcript-modal-title');
  const modalBody = document.getElementById('transcript-modal-body');
  const copyBtn = document.getElementById('copy-transcript-btn');
  const transcriptModal = modalElement ? new bootstrap.Modal(modalElement) : null;

  function setTableLoading() {
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Loading transcripts…</td></tr>';
  }

  function showError(message) {
    if (!errorAlert) return;
    errorAlert.classList.remove('d-none');
    errorAlert.textContent = message;
  }

  function clearError() {
    if (!errorAlert) return;
    errorAlert.classList.add('d-none');
    errorAlert.textContent = '';
  }

  function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  }

  function renderProgressCell(value) {
    const pct = Math.max(0, Math.min(Number(value) || 0, 100));
    return `
      <div class="d-flex align-items-center gap-2">
        <div class="progress flex-grow-1" style="height: 6px;">
          <div class="progress-bar" role="progressbar" style="width: ${pct}%" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <span class="text-muted small">${pct}%</span>
      </div>
    `;
  }

  function renderDocuments(documents) {
    if (!tableBody) return;

    if (!documents || !documents.length) {
      tableBody.innerHTML = '';
      if (emptyState) {
        emptyState.classList.remove('d-none');
      }
      return;
    }

    if (emptyState) {
      emptyState.classList.add('d-none');
    }

    const rows = documents.map((doc) => {
      const isReady = Number(doc.percentage_complete) >= 100;
      const disabledAttr = isReady ? '' : 'disabled';
      const status = doc.status || (isReady ? 'Complete' : 'Processing');
      const titleLine = doc.title ? `<div class="text-muted small">${doc.title}</div>` : '';
      return `
        <tr data-document-id="${doc.document_id}">
          <td>
            <div class="fw-semibold">${doc.file_name}</div>
            ${titleLine}
          </td>
          <td>${status}</td>
          <td>${renderProgressCell(doc.percentage_complete)}</td>
          <td>${formatTimestamp(doc.last_updated)}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary view-transcript-btn" ${disabledAttr} data-document-id="${doc.document_id}" data-file-name="${doc.file_name}">
              View transcript
            </button>
          </td>
        </tr>
      `;
    });

    tableBody.innerHTML = rows.join('');
  }

  async function fetchTranscripts() {
    setTableLoading();
    clearError();

    try {
      const response = await fetch('/api/transcripts');
      if (!response.ok) {
        const message = await response.text();
        showError(`Unable to load transcripts: ${message || response.statusText}`);
        tableBody.innerHTML = '';
        return;
      }

      const data = await response.json();
      renderDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to load transcripts', error);
      showError('Failed to load transcripts. Please try again later.');
      tableBody.innerHTML = '';
    }
  }

  function setUploadStatus(message, type = 'muted') {
    if (!uploadStatus) return;
    uploadStatus.className = '';
    uploadStatus.classList.add(`text-${type}`);
    uploadStatus.textContent = message;
  }

  async function uploadSelectedFiles(event) {
    event.preventDefault();
    if (!fileInput || !fileInput.files?.length) {
      setUploadStatus('Please select at least one audio file.', 'warning');
      return;
    }

    const formData = new FormData();
    Array.from(fileInput.files).forEach((file) => {
      formData.append('file', file);
    });

    setUploadStatus('Uploading…', 'muted');
    fileInput.disabled = true;

    try {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errs = result.errors?.join('\n') || response.statusText || 'Upload failed.';
        setUploadStatus(errs, 'danger');
        return;
      }

      const messageParts = [];
      if (result.processed_filenames?.length) {
        messageParts.push(`Queued ${result.processed_filenames.length} file(s) for transcription.`);
      }
      if (result.errors?.length) {
        messageParts.push(`Warnings: ${result.errors.join(' | ')}`);
      }
      setUploadStatus(messageParts.join(' '), 'success');
      fileInput.value = '';
      fetchTranscripts();
    } catch (error) {
      console.error('Upload failed', error);
      setUploadStatus('Upload failed. Please try again.', 'danger');
    } finally {
      fileInput.disabled = false;
    }
  }

  async function loadTranscript(documentId, fileName) {
    if (!transcriptModal) return;
    modalTitle.textContent = fileName || 'Transcript';
    modalBody.textContent = 'Loading transcript…';
    copyBtn.disabled = true;
    transcriptModal.show();

    try {
      const response = await fetch(`/api/transcripts/${encodeURIComponent(documentId)}/chunks`);
      if (!response.ok) {
        const message = await response.text();
        modalBody.textContent = `Unable to load transcript: ${message || response.statusText}`;
        return;
      }

      const data = await response.json();
      const textBlocks = (data.chunks || []).map((chunk, index) => {
        const headerParts = [];
        if (chunk.page_number) headerParts.push(`Segment ${chunk.page_number}`);
        else headerParts.push(`Segment ${index + 1}`);
        if (chunk.chunk_sequence && chunk.chunk_sequence !== chunk.page_number) {
          headerParts.push(`#${chunk.chunk_sequence}`);
        }
        return `${headerParts.join(' ')}\n${chunk.text || ''}`.trim();
      });

      if (!textBlocks.length) {
        modalBody.textContent = 'Transcript is not available yet. Please try again after processing completes.';
        copyBtn.disabled = true;
        return;
      }

      modalBody.textContent = textBlocks.join('\n\n');
      copyBtn.disabled = false;
    } catch (error) {
      console.error('Failed to load transcript', error);
      modalBody.textContent = 'Failed to load transcript. Please try again later.';
      copyBtn.disabled = true;
    }
  }

  async function handleCopyTranscript() {
    if (!navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(modalBody.textContent || '');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy transcript';
      }, 2000);
    } catch (error) {
      console.error('Clipboard copy failed', error);
      copyBtn.textContent = 'Copy failed';
      setTimeout(() => {
        copyBtn.textContent = 'Copy transcript';
      }, 2000);
    }
  }

  function handleTableClick(event) {
    const button = event.target.closest('.view-transcript-btn');
    if (!button) return;
    const documentId = button.getAttribute('data-document-id');
    const fileName = button.getAttribute('data-file-name');
    if (!documentId) return;
    loadTranscript(documentId, fileName);
  }

  if (uploadForm) {
    uploadForm.addEventListener('submit', uploadSelectedFiles);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', (event) => {
      event.preventDefault();
      fetchTranscripts();
    });
  }

  if (tableBody) {
    tableBody.addEventListener('click', handleTableClick);
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', handleCopyTranscript);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchTranscripts();
    }
  });

  // Initial load
  fetchTranscripts();
})();
