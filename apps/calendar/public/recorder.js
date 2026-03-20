// Audio recorder and scope viewer Unpoly compilers.

// --- Unpoly compiler: [data-audio-recorder] ---
// Renders a record/stop button and handles audio capture via MediaRecorder.
// On stop, uploads the recording to the API and triggers processing.
up.compiler('[data-audio-recorder]', function(el) {
    var projectId = el.getAttribute('data-project-id');
    var mediaRecorder = null;
    var audioChunks = [];
    var isRecording = false;
    var startTime = null;

    // Build UI
    var statusEl = document.createElement('div');
    statusEl.style.cssText = 'text-align:center;margin-bottom:1rem;font-size:0.8125rem;color:var(--mz-color-gray-500)';
    statusEl.textContent = 'Tap the button to start recording.';
    el.appendChild(statusEl);

    var timerEl = document.createElement('div');
    timerEl.style.cssText = 'text-align:center;font-size:1.5rem;font-weight:700;margin-bottom:1rem;display:none';
    timerEl.textContent = '0:00';
    el.appendChild(timerEl);

    var recordBtn = document.createElement('button');
    recordBtn.className = 'cal-btn';
    recordBtn.textContent = 'Start Recording';
    el.appendChild(recordBtn);

    var errorEl = document.createElement('div');
    errorEl.className = 'cal-error';
    el.appendChild(errorEl);

    var recordingsList = document.createElement('div');
    recordingsList.style.cssText = 'margin-top:1rem';
    el.appendChild(recordingsList);

    var timerInterval = null;

    function updateTimer() {
        if (!startTime) return;
        var elapsed = Math.floor((Date.now() - startTime) / 1000);
        var mins = Math.floor(elapsed / 60);
        var secs = elapsed % 60;
        timerEl.textContent = mins + ':' + String(secs).padStart(2, '0');
    }

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    }

    function addRecordingItem(recording) {
        var item = document.createElement('div');
        item.style.cssText = 'padding:0.625rem 0.875rem;background:var(--mz-color-gray-50);border-radius:0.5rem;margin-bottom:0.5rem;font-size:0.8125rem;display:flex;justify-content:space-between;align-items:center';

        var label = document.createElement('span');
        var status = recording.status || 'uploading';
        label.textContent = 'Recording';

        var badge = document.createElement('span');
        badge.className = 'cal-status-badge';
        if (status === 'transcribed') {
            badge.style.cssText = 'background:#ecfdf5;color:#059669';
            badge.textContent = 'Transcribed';
        } else if (status === 'processing' || status === 'uploaded') {
            badge.style.cssText = 'background:#eff6ff;color:#2563eb';
            badge.textContent = 'Processing';
        } else if (status === 'failed') {
            badge.style.cssText = 'background:#fef2f2;color:#dc2626';
            badge.textContent = 'Failed';
        } else {
            badge.style.cssText = 'background:#fffbeb;color:#d97706';
            badge.textContent = 'Uploading';
        }

        item.appendChild(label);
        item.appendChild(badge);
        recordingsList.insertBefore(item, recordingsList.firstChild);
        return { item: item, badge: badge };
    }

    async function startRecording() {
        try {
            var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm'
            });

            mediaRecorder.addEventListener('dataavailable', function(e) {
                if (e.data.size > 0) audioChunks.push(e.data);
            });

            mediaRecorder.addEventListener('stop', function() {
                stream.getTracks().forEach(function(t) { t.stop(); });
                var blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
                handleRecordingComplete(blob);
            });

            mediaRecorder.start(1000);
            isRecording = true;
            startTime = Date.now();
            timerEl.style.display = 'block';
            timerInterval = setInterval(updateTimer, 1000);
            recordBtn.textContent = 'Stop Recording';
            recordBtn.style.background = '#dc2626';
            statusEl.textContent = 'Recording... Describe the work you need done.';
            errorEl.style.display = 'none';
        } catch (err) {
            showError('Could not access microphone. Please allow microphone access and try again.');
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        clearInterval(timerInterval);
        timerEl.style.display = 'none';
        recordBtn.textContent = 'Record Another';
        recordBtn.style.background = '';
        statusEl.textContent = 'Recording saved. You can add more recordings to refine your scope.';
    }

    async function handleRecordingComplete(blob) {
        var ui = addRecordingItem({ status: 'uploading' });

        try {
            // 1. Create recording record
            var createResp = await fetch('/api/recording/create_recording', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    session_id: ''
                })
            });
            if (!createResp.ok) throw new Error('Failed to create recording');
            var recording = await createResp.json();
            var recordingId = recording.record ? recording.record.id : (recording.id || (recording[0] && recording[0].id));

            // 2. Get presigned upload URL from blob store
            var ext = blob.type.indexOf('webm') >= 0 ? 'webm' : 'ogg';
            var presignResp = await fetch('/_blob/presign-put', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    module: 'recording',
                    record_id: recordingId,
                    field_name: 'audio',
                    filename: recordingId + '.' + ext,
                    content_type: blob.type || 'audio/webm'
                })
            });
            if (!presignResp.ok) throw new Error('Failed to get upload URL');
            var presign = await presignResp.json();

            // 3. Upload audio directly to storage (S3 presigned URL or local proxy)
            var uploadResp = await fetch(presign.url, {
                method: 'PUT',
                body: blob,
                headers: { 'Content-Type': blob.type || 'audio/webm' }
            });
            if (!uploadResp.ok) throw new Error('Audio upload failed');

            // 4. Mark recording as uploaded with the blob key
            var markResp = await fetch('/api/recording/mark_uploaded', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: recordingId,
                    project_id: projectId,
                    session_id: '',
                    audio_key: presign.key
                })
            });
            if (!markResp.ok) throw new Error('Failed to mark uploaded');

            ui.badge.style.cssText = 'background:#eff6ff;color:#2563eb';
            ui.badge.textContent = 'Uploaded';

            // Poll for transcript completion
            pollRecording(recordingId, ui);
        } catch (err) {
            ui.badge.style.cssText = 'background:#fef2f2;color:#dc2626';
            ui.badge.textContent = 'Failed';
            showError('Upload failed: ' + err.message);
        }
    }

    function pollRecording(recordingId, ui) {
        var attempts = 0;
        var maxAttempts = 60;

        var poll = setInterval(async function() {
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(poll);
                ui.badge.style.cssText = 'background:#fef2f2;color:#dc2626';
                ui.badge.textContent = 'Timeout';
                return;
            }

            try {
                var resp = await fetch('/api/recording/' + recordingId);
                var data = await resp.json();
                var rec = Array.isArray(data) ? data[0] : data;

                if (rec.status === 'transcribed') {
                    clearInterval(poll);
                    ui.badge.style.cssText = 'background:#ecfdf5;color:#059669';
                    ui.badge.textContent = 'Transcribed';
                    refreshScope();
                } else if (rec.status === 'failed') {
                    clearInterval(poll);
                    ui.badge.style.cssText = 'background:#fef2f2;color:#dc2626';
                    ui.badge.textContent = 'Failed';
                }
            } catch (e) { /* retry */ }
        }, 5000);
    }

    function refreshScope() {
        var viewer = document.querySelector('[data-scope-viewer]');
        if (viewer && viewer._refreshScope) viewer._refreshScope();
    }

    recordBtn.addEventListener('click', function() {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    // Load existing recordings
    fetch('/api/recording/by-project/' + projectId)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var recs = Array.isArray(data) ? data : [];
            recs.forEach(function(rec) { addRecordingItem(rec); });
        })
        .catch(function() {});
});

// --- Unpoly compiler: [data-scope-viewer] ---
// Displays the current project scope summary and refreshes on demand.
up.compiler('[data-scope-viewer]', function(el) {
    var projectId = el.getAttribute('data-project-id');

    var headerEl = document.createElement('h3');
    headerEl.style.cssText = 'font-size:1rem;font-weight:700;margin-bottom:0.75rem';
    headerEl.textContent = 'Project Scope';
    el.appendChild(headerEl);

    var contentEl = document.createElement('div');
    el.appendChild(contentEl);

    function renderScope(project) {
        var scopeStatus = project.scope_status || 'none';
        var generation = project.scope_generation || 0;
        contentEl.innerHTML = '';

        if (scopeStatus === 'none' && generation === 0) {
            var empty = document.createElement('p');
            empty.style.cssText = 'font-size:0.875rem;color:var(--mz-color-gray-500)';
            empty.textContent = 'No scope generated yet. Record audio describing your project to get started.';
            contentEl.appendChild(empty);
            return;
        }

        if (scopeStatus === 'generating') {
            var loading = document.createElement('div');
            loading.className = 'cal-loading';
            loading.textContent = 'Generating scope...';
            contentEl.appendChild(loading);
            return;
        }

        var summary = project.scope_summary || '';
        if (!summary) return;

        try {
            // Strip markdown fences if the LLM wrapped the JSON.
            var cleaned = summary.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
            var scope = JSON.parse(cleaned);
            renderScopeJSON(scope);
        } catch (e) {
            var pre = document.createElement('pre');
            pre.style.cssText = 'font-size:0.75rem;overflow-x:auto;padding:1rem;background:var(--mz-color-gray-50);border-radius:0.5rem';
            pre.textContent = summary;
            contentEl.appendChild(pre);
        }
    }

    function renderScopeJSON(scope) {
        // Project summary
        if (scope.project_summary) {
            var summaryEl = document.createElement('p');
            summaryEl.style.cssText = 'font-size:0.875rem;margin-bottom:1rem;color:var(--mz-color-gray-700)';
            summaryEl.textContent = scope.project_summary;
            contentEl.appendChild(summaryEl);
        }

        // Budget range
        if (scope.overall_budget_min || scope.overall_budget_max) {
            var budgetEl = document.createElement('div');
            budgetEl.style.cssText = 'padding:0.75rem 1rem;background:var(--mz-color-gray-50);border-radius:0.5rem;margin-bottom:1rem;font-size:0.875rem';
            var minDollars = Math.round((scope.overall_budget_min || 0) / 100);
            var maxDollars = Math.round((scope.overall_budget_max || 0) / 100);
            budgetEl.textContent = 'Estimated budget: $' + minDollars.toLocaleString() + ' \u2013 $' + maxDollars.toLocaleString();
            contentEl.appendChild(budgetEl);
        }

        // Categories
        var categories = scope.scope_categories || [];
        categories.forEach(function(cat) {
            var catEl = document.createElement('div');
            catEl.style.cssText = 'margin-bottom:1rem';

            var catHeader = document.createElement('h4');
            catHeader.style.cssText = 'font-size:0.875rem;font-weight:700;margin-bottom:0.5rem';
            catHeader.textContent = cat.category;
            catEl.appendChild(catHeader);

            var tasks = cat.tasks || [];
            tasks.forEach(function(task) {
                var taskEl = document.createElement('div');
                taskEl.style.cssText = 'padding:0.5rem 0.75rem;background:var(--mz-color-gray-50);border-radius:0.375rem;margin-bottom:0.375rem;font-size:0.8125rem';

                var taskName = document.createElement('div');
                taskName.style.cssText = 'font-weight:600';
                taskName.textContent = task.task;
                taskEl.appendChild(taskName);

                if (task.location) {
                    var loc = document.createElement('div');
                    loc.style.cssText = 'color:var(--mz-color-gray-500);font-size:0.75rem';
                    loc.textContent = task.location;
                    taskEl.appendChild(loc);
                }

                if (task.details) {
                    var details = document.createElement('div');
                    details.style.cssText = 'margin-top:0.25rem;color:var(--mz-color-gray-600)';
                    details.textContent = task.details;
                    taskEl.appendChild(details);
                }

                catEl.appendChild(taskEl);
            });

            contentEl.appendChild(catEl);
        });
    }

    function loadScope() {
        fetch('/api/project/' + projectId)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var project = Array.isArray(data) ? data[0] : data;
                if (project) renderScope(project);
            })
            .catch(function() {});
    }

    el._refreshScope = loadScope;
    loadScope();
});
