import { LightningElement, track } from 'lwc';
import { OmniscriptBaseMixin } from 'omnistudio/omniscriptBaseMixin';
import createContentDocument from '@salesforce/apex/AddInContentDocumentService.createContentDocument';
import deleteContentDocument from '@salesforce/apex/AddInContentDocumentService.deleteContentDocument';

export default class OcrUploader extends OmniscriptBaseMixin(LightningElement) {
    @track imagePreviewUrl = '';
    @track fileName = '';
    @track progressText = '';
    @track contentDocumentId = '';

    loading = false;
    file = null;
    _iframeReady = false;
    _pendingResolve = null;
    _pendingReject = null;
    _boundMessageHandler = null;

    /* =======================
       Helpers
    ======================== */

    _STATUS_MAP = {
        'loading tesseract core': 'Cargando motor OCR…',
        'initializing tesseract': 'Inicializando OCR…',
        'loading language traineddata': 'Cargando datos de idioma…',
        'initializing api': 'Inicializando API…',
        'recognizing text': 'Reconociendo texto…'
    };

    get isButtonDisabled() {
        return !this.file || this.loading;
    }

    get hasDocument() {
        return this.contentDocumentId && this.contentDocumentId.length > 0;
    }

    get ocrIframeUrl() {
        return '/apex/OcrProcessor';
    }

    get componentTitle() {
        try {
            return this.omniJsonData?.componentTitle || 'Document OCR';
        } catch (_e) {
            return 'Document OCR';
        }
    }

    get acceptedFormats() {
        try {
            return this.omniJsonData?.acceptedFormats || 'image/*,.pdf';
        } catch (_e) {
            return 'image/*,.pdf';
        }
    }

    /**
     * Reads "fileTitle" from OmniScript JSON data.
     * Falls back to the uploaded file name.
     */
    _getFileTitle() {
        try {
            return this.omniJsonData?.fileTitle || this.fileName || 'Untitled';
        } catch (_e) {
            return this.fileName || 'Untitled';
        }
    }

    /**
     * Reads "recordId" from OmniScript JSON data.
     * Used to create a ContentDocumentLink.
     */
    _getRecordId() {
        try {
            return this.omniJsonData?.recordId || '';
        } catch (_e) {
            return '';
        }
    }

    /* =======================
       Lifecycle
    ======================== */

    connectedCallback() {
        console.log('[OCR] connectedCallback');
        this._boundMessageHandler = this._handleMessage.bind(this);
        window.addEventListener('message', this._boundMessageHandler);
    }

    disconnectedCallback() {
        if (this._boundMessageHandler) {
            window.removeEventListener('message', this._boundMessageHandler);
        }
    }

    /* =======================
       Iframe communication
    ======================== */

    handleIframeLoad() {
        console.log('[OCR] iframe loaded');
        // The VF page sends { type: 'ocrReady' } when its scripts finish
    }

    _getIframe() {
        return this.template.querySelector('iframe.ocr-frame');
    }

    _postToIframe(data) {
        const iframe = this._getIframe();
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(data, '*');
        } else {
            throw new Error('OCR iframe not available');
        }
    }

    _handleMessage(event) {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'ocrReady':
                console.log('[OCR] VF iframe ready');
                this._iframeReady = true;
                break;

            case 'ocrProgress':
                console.log('[OCR] Progress:', msg.status, Math.round((msg.progress || 0) * 100) + '%');
                this.progressText = this._STATUS_MAP[msg.status] || msg.status || 'Procesando…';
                break;

            case 'ocrResult':
                console.log('[OCR] Result received, length:', msg.text?.length);
                if (this._pendingResolve) {
                    this._pendingResolve(msg.text);
                    this._pendingResolve = null;
                    this._pendingReject = null;
                }
                break;

            case 'ocrError':
                console.error('[OCR] VF error:', msg.error);
                if (this._pendingReject) {
                    this._pendingReject(new Error(msg.error));
                    this._pendingResolve = null;
                    this._pendingReject = null;
                }
                break;

            default:
                break;
        }
    }

    /* =======================
       File handling
    ======================== */

    handleFileChange(event) {
        console.log('[OCR] handleFileChange triggered');

        const files = event.target.files;
        if (!files || files.length === 0) {
            this.file = null;
            this.fileName = '';
            this.imagePreviewUrl = '';
            this.ocrText = '';
            this.contentDocumentId = '';
            return;
        }

        this.file = files[0];
        this.fileName = this.file.name;
        this.progressText = '';

        console.log('[OCR] File selected:', this.file.name, 'type:', this.file.type, 'size:', this.file.size);

        if (this.file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.imagePreviewUrl = e.target.result;
            };
            reader.readAsDataURL(this.file);
        } else {
            this.imagePreviewUrl = '';
        }

        // Delete previous document if one exists, then fire OCR
        this._deletePreviousDocument().then(() => this.runOCR());
    }

    async _deletePreviousDocument() {
        if (!this.contentDocumentId) return;
        try {
            console.log('[OCR] Auto-deleting previous ContentDocument:', this.contentDocumentId);
            await deleteContentDocument({ contentDocumentId: this.contentDocumentId });
            console.log('[OCR] Previous ContentDocument deleted');
            this.contentDocumentId = '';
        } catch (err) {
            console.warn('[OCR] Failed to delete previous document:', err?.message || err);
        }
    }

    /* =======================
       OCR execution
    ======================== */

    async runOCR() {
        console.log('[OCR] runOCR called');
        if (!this.file) return;

        if (!this._iframeReady) {
            console.warn('[OCR] iframe not ready, retrying in 1s...');
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => this.runOCR(), 1000);
            return;
        }

        this.loading = true;
        this.progressText = 'Iniciando OCR…';

        try {
            // Read file as data URL for both OCR (images) and base64 extraction
            const dataUrl = await this._readFileAsDataUrl(this.file);
            const base64Data = dataUrl.split(',')[1];

            let text;

            if (this.file.type === 'application/pdf') {
                console.log('[OCR] Sending PDF to iframe');
                const buffer = await this.file.arrayBuffer();
                text = await this._sendOcrRequest('ocrPdf', buffer);
            } else {
                console.log('[OCR] Sending image to iframe');
                text = await this._sendOcrRequest('ocrImage', dataUrl);
            }

            console.log('[OCR] OCR complete. Length:', text?.length);

            // Create ContentDocument in Salesforce
            this.progressText = 'Guardando documento…';
            const title = this._getFileTitle();
            const recordId = this._getRecordId();

            console.log('[OCR] Creating ContentDocument, title:', title, 'recordId:', recordId);
            const docResult = await createContentDocument({
                base64Data: base64Data,
                fileName: title,
                recordId: recordId,
                ocrText: text || ''
            });
            console.log('[OCR] ContentDocument created:', docResult);

            this.contentDocumentId = docResult.contentDocumentId;
            this.omniApplyCallResp({
                ocrText: text || '',
                contentDocumentId: docResult.contentDocumentId,
                contentVersionId: docResult.contentVersionId,
                contentDocumentLinkId: docResult.contentDocumentLinkId || ''
            });
            console.log('[OCR] omniApplyCallResp called');
        } catch (err) {
            console.error('[OCR] ERROR:', err?.message || err);
        } finally {
            this.loading = false;
            this.progressText = '';
        }
    }

    _readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    _sendOcrRequest(type, data) {
        return new Promise((resolve, reject) => {
            this._pendingResolve = resolve;
            this._pendingReject = reject;
            this._postToIframe({ type, data });
        });
    }

    /* =======================
       Delete functionality
    ======================== */

    async handleDeleteDocument() {
        console.log('[OCR] handleDeleteDocument called');
        if (!this.contentDocumentId) {
            console.warn('[OCR] No ContentDocument to delete');
            return;
        }

        this.loading = true;
        this.progressText = 'Eliminando documento…';

        try {
            console.log('[OCR] Deleting ContentDocument:', this.contentDocumentId);
            await deleteContentDocument({
                contentDocumentId: this.contentDocumentId
            });
            console.log('[OCR] ContentDocument deleted successfully');

            this.file = null;
            this.fileName = '';
            this.imagePreviewUrl = '';
            this.contentDocumentId = '';
            this.progressText = '';

            this.omniApplyCallResp({
                ocrText: '',
                contentDocumentId: '',
                contentVersionId: '',
                contentDocumentLinkId: ''
            });
            console.log('[OCR] State reset after deletion');
        } catch (err) {
            console.error('[OCR] DELETE ERROR:', err?.message || err);
            this.progressText = 'Error al eliminar documento';
        } finally {
            this.loading = false;
        }
    }
}
