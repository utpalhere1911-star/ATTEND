/**
 * ATTEND. - Student Portal
 * Supabase backend integration
 */

document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.supabaseClient;

    // --- State Management ---
    const state = {
        currentView: 'none', // 'open', 'closed', 'none', 'success'
        session: null,
        submission: {
            name: '',
            rollNumber: '',
            photoFile: null
        }
    };

    // --- DOM Elements ---
    const els = {
        views: {
            open: document.getElementById('view-open'),
            closed: document.getElementById('view-closed'),
            none: document.getElementById('view-none'),
            success: document.getElementById('view-success'),
        },
        form: document.getElementById('attendance-form'),
        inputs: {
            name: document.getElementById('student-name'),
            rollNumber: document.getElementById('roll-number'),
            photoCamera: document.getElementById('photo-camera'),
        },
        upload: {
            container: document.getElementById('upload-container'),
            actions: document.getElementById('upload-actions'),
            preview: document.getElementById('upload-preview'),
            previewImg: document.getElementById('preview-img'),
            btnTakePhoto: document.getElementById('btn-take-photo'),
            btnRetake: document.getElementById('btn-retake'),
            errorMsg: document.getElementById('error-photo')
        },
        submitBtn: document.getElementById('btn-submit'),
        
        // Metadata fields
        sessionSubject: document.getElementById('session-subject'),
        sessionDate: document.getElementById('session-date'),
        successSubject: document.getElementById('success-subject'),
        successDate: document.getElementById('success-date'),
        closedSubject: document.getElementById('closed-subject'),
        closedDate: document.getElementById('closed-date')
    };

    init();

    function init() {
        bindEvents();
        fetchActiveSession();
    }

    async function fetchActiveSession() {
        try {
            // First, try to get the latest OPEN session
            const { data: openData, error: openError } = await supabase
                .from('attendance_sessions')
                .select('*')
                .eq('status', 'open')
                .order('attendance_date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(1);

            if (openError) throw openError;

            if (openData && openData.length > 0) {
                state.session = openData[0];
                state.currentView = 'open';
            } else {
                // If no open session, try to get the most recent session overall
                const { data: allData, error: allError } = await supabase
                    .from('attendance_sessions')
                    .select('*')
                    .order('attendance_date', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(1);
                    
                if (allError) throw allError;

                if (allData && allData.length > 0) {
                    state.session = allData[0];
                    state.currentView = 'closed';
                } else {
                    state.session = null;
                    state.currentView = 'none';
                }
            }
            
            populateSessionData();
            updateView();
            
        } catch (err) {
            console.error('Failed to fetch session:', err);
            state.currentView = 'none';
            updateView();
        }
    }

    function bindEvents() {
        els.form.addEventListener('submit', handleFormSubmit);

        els.inputs.name.addEventListener('input', () => clearError('name'));
        els.inputs.rollNumber.addEventListener('input', () => clearError('rollNumber'));
        
        els.upload.btnTakePhoto.addEventListener('click', () => els.inputs.photoCamera.click());
        els.upload.btnRetake.addEventListener('click', () => els.inputs.photoCamera.click());

        els.inputs.photoCamera.addEventListener('change', handlePhotoSelection);
    }

    function populateSessionData() {
        if (!state.session) return;
        
        const dateStr = new Date(state.session.attendance_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        
        if(els.sessionSubject) els.sessionSubject.innerHTML = state.session.subject.replace(' ', '<br>');
        if(els.sessionDate) els.sessionDate.textContent = dateStr;
        if(els.successSubject) els.successSubject.textContent = state.session.subject;
        if(els.successDate) els.successDate.textContent = dateStr;
        if(els.closedSubject) els.closedSubject.innerHTML = state.session.subject.replace(' ', '<br>');
        if(els.closedDate) els.closedDate.textContent = dateStr;
    }

    function updateView() {
        Object.values(els.views).forEach(view => {
            if(view) {
                view.classList.remove('active');
                view.classList.add('hidden');
            }
        });

        const currentViewElement = els.views[state.currentView];
        if (currentViewElement) {
            currentViewElement.classList.remove('hidden');
            setTimeout(() => {
                currentViewElement.classList.add('active');
            }, 10);
        }
    }

    async function handleFormSubmit(e) {
        e.preventDefault();

        if (!validateForm()) return;

        state.submission.name = els.inputs.name.value.trim();
        state.submission.rollNumber = els.inputs.rollNumber.value.trim();

        setLoadingState(true);

        try {
            // 1. Prepare Student Record (creates or updates, returning UUID)
            const { data: studentId, error: prepareErr } = await supabase
                .rpc('prepare_attendance_student', {
                    p_session_id: state.session.id,
                    p_roll_number: state.submission.rollNumber,
                    p_name: state.submission.name
                });
            
            if (prepareErr) {
                if (prepareErr.code === '23505' || (prepareErr.message && prepareErr.message.includes('unique constraint'))) {
                    // Fallback just in case, though the RPC handles updates
                    throw new Error("Student preparation failed due to conflict.");
                }
                throw prepareErr;
            }

            // 2. Upload photo to Storage (using the returned database UUID)
            const file = state.submission.photoFile;
            const fileExt = file.name.split('.').pop() || 'jpg';
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `attendance/${state.session.id}/${studentId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('blackboard-photos')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) throw uploadError;

            // 3. Final Check: is session still open?
            const { data: checkData, error: checkErr } = await supabase
                .from('attendance_sessions')
                .select('status')
                .eq('id', state.session.id)
                .maybeSingle();

            if (checkErr || !checkData || checkData.status !== 'open') {
                // Clean up the uploaded photo since the session ended during upload
                await supabase.storage.from('blackboard-photos').remove([filePath]);
                
                alert("ATTENDANCE SESSION ENDED\n\nThis attendance session has ended. You can no longer submit attendance.");
                state.currentView = 'closed';
                updateView();
                return;
            }

            // 4. Create submission via RPC
            const { data: submissionId, error: subErr } = await supabase
                .rpc('submit_attendance', {
                    p_session_id: state.session.id,
                    p_roll_number: state.submission.rollNumber,
                    p_name: state.submission.name,
                    p_photo_path: filePath
                });

            if (subErr) {
                // Clean up the uploaded photo
                await supabase.storage.from('blackboard-photos').remove([filePath]);

                if (subErr.code === '23505' || (subErr.message && subErr.message.includes('unique constraint'))) {
                    alert("Attendance already submitted for this session.");
                    return;
                }
                throw subErr;
            }

            // 4. Success
            state.currentView = 'success';
            updateView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
        } catch (error) {
            console.error('Submission failed:', error);
            alert('Unable to submit attendance. Please check your internet connection and try again.');
        } finally {
            setLoadingState(false);
        }
    }

    function validateForm() {
        let isValid = true;
        const nameVal = els.inputs.name.value.trim();
        const rollVal = els.inputs.rollNumber.value.trim();

        if (!nameVal) {
            showError('name');
            isValid = false;
        }
        if (!rollVal) {
            showError('rollNumber');
            isValid = false;
        }
        if (!state.submission.photoFile) {
            showError('photo');
            isValid = false;
        }

        return isValid;
    }

    function showError(field, customMessage = null) {
        const inputGroup = (field === 'photo')
            ? els.upload.container.closest('.form-section')
            : els.inputs[field].closest('.form-section');
            
        if (inputGroup) {
            inputGroup.classList.add('has-error');
            if (field === 'photo' && customMessage) {
                els.upload.errorMsg.textContent = customMessage;
            } else if (field === 'photo') {
                els.upload.errorMsg.textContent = 'Please upload the classroom Blackboard photo.';
            }
        }
    }

    function clearError(field) {
        const inputGroup = (field === 'photo')
            ? els.upload.container.closest('.form-section')
            : els.inputs[field].closest('.form-section');
            
        if (inputGroup) inputGroup.classList.remove('has-error');
    }

    function handlePhotoSelection(e) {
        const file = e.target.files[0];
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showError('photo', 'Please select a valid image file (JPEG, PNG, or WebP).');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            showError('photo', 'This image is too large. Please choose a smaller photo (max 5MB).');
            return;
        }

        state.submission.photoFile = file;
        clearError('photo');

        const objectUrl = URL.createObjectURL(file);
        els.upload.previewImg.src = objectUrl;
        
        els.upload.actions.classList.add('hidden');
        els.upload.preview.classList.remove('hidden');
    }

    function setLoadingState(isLoading) {
        if (isLoading) {
            els.submitBtn.classList.add('loading');
            els.submitBtn.disabled = true;
            els.inputs.name.disabled = true;
            els.inputs.rollNumber.disabled = true;
            els.upload.container.style.pointerEvents = 'none';
        } else {
            els.submitBtn.classList.remove('loading');
            els.submitBtn.disabled = false;
            els.inputs.name.disabled = false;
            els.inputs.rollNumber.disabled = false;
            els.upload.container.style.pointerEvents = 'auto';
        }
    }
});
