/**
 * Admin Portal - Supabase Implementation
 */

document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.supabaseClient;

    // --- State ---
    const state = {
        currentView: 'overview',
        selectedSessionId: null,
        selectedStudentRoll: null,
        selectedSubmission: null,
    };

    // --- DOM Elements ---
    const els = {
        adminLayout: document.getElementById('admin-layout'),
        modalLogin: document.getElementById('modal-login'),
        formLogin: document.getElementById('form-login'),
        loginError: document.getElementById('login-error'),
        sidebar: document.getElementById('sidebar'),
        mobileBtn: document.getElementById('mobile-menu-btn'),
        mobileCloseBtn: document.getElementById('mobile-close-btn'),
        navItems: document.querySelectorAll('.nav-item'),
        views: document.querySelectorAll('.view-section'),
        linkBtns: document.querySelectorAll('.link-btn'),
        
        // Overview
        activeSessionBlock: document.getElementById('overview-content'),
        
        // Tables
        sessionListTbody: document.getElementById('session-list-tbody'),
        sdStudentsTbody: document.getElementById('sd-students-tbody'),
        studHistoryTbody: document.getElementById('stud-history-tbody'),
        
        // Session Details
        sdSubject: document.getElementById('sd-subject'),
        sdDate: document.getElementById('sd-date'),
        sdCode: document.getElementById('sd-code'),
        sdStatusBadge: document.getElementById('sd-status-badge'),
        sdTotal: document.getElementById('sd-total'),
        sdVerified: document.getElementById('sd-verified'),
        sdReview: document.getElementById('sd-review'),
        btnEndAttendance: document.getElementById('btn-end-attendance'),
        
        // Student Details
        studName: document.getElementById('stud-name'),
        studRoll: document.getElementById('stud-roll'),
        studPresent: document.getElementById('stud-present'),
        studAbsent: document.getElementById('stud-absent'),
        studPercent: document.getElementById('stud-percent'),
        
        // Submission Details
        subName: document.getElementById('sub-name'),
        subRoll: document.getElementById('sub-roll'),
        subSubject: document.getElementById('sub-subject'),
        subDate: document.getElementById('sub-date'),
        subTime: document.getElementById('sub-time'),
        subStatus: document.getElementById('sub-status'),
        btnMarkVerified: document.getElementById('btn-mark-verified'),
        btnMarkDuplicate: document.getElementById('btn-mark-duplicate'),
        
        // Reviews
        reviewContainer: document.getElementById('review-container'),
        
        // Modals
        modalStartSession: document.getElementById('modal-start-session'),
        modalAddStudent: document.getElementById('modal-add-student'),
        btnStartSession: document.getElementById('btn-start-session'),
        btnStartSession2: document.getElementById('btn-start-session-2'),
        btnAddStudentManual: document.getElementById('btn-add-student-manual'),
        modalCloseBtns: document.querySelectorAll('.modal-close'),
        formStartSession: document.getElementById('form-start-session'),
        formAddStudent: document.getElementById('form-add-student'),
        newSessionCode: document.getElementById('new-session-code'),
        btnGenerateCode: document.getElementById('btn-generate-code'),
        
        // Utils
        btnDownloadPdf: document.getElementById('btn-export-pdf'),
        btnDownloadPdfSession: document.getElementById('btn-download-pdf-session'),
        
        // Admin Profile
        adminDisplayName: document.getElementById('admin-display-name'),
        btnLogout: document.getElementById('btn-logout'),
        
        // Student Details trigger in Submission Review
        btnViewStudentHistory: document.getElementById('btn-view-student-history'),
        
        // Session List dropdown for reports
        reportSessionSelect: document.getElementById('report-session-select'),
        reportStats: document.getElementById('report-stats'),
        rsCode: document.getElementById('rs-code'),
        rsTotal: document.getElementById('rs-total'),
        rsVerified: document.getElementById('rs-verified')
    };

    init();

    async function init() {
        bindAuthEvents();
        
        // Check existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await verifyAdminAndInitialize(session.user.id);
        }
    }

    function bindAuthEvents() {
        els.formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const btn = document.getElementById('btn-login-submit');
            
            btn.textContent = 'Logging in...';
            btn.disabled = true;
            els.loginError.classList.add('hidden');

            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                await verifyAdminAndInitialize(data.user.id);
            } catch (err) {
                els.loginError.textContent = err.message || 'Login failed.';
                els.loginError.classList.remove('hidden');
                btn.textContent = 'LOGIN';
                btn.disabled = false;
            }
        });
        // Logout button addition
        els.btnLogout.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.reload();
        });
    }

    async function verifyAdminAndInitialize(userId) {
        // Verify in admin_users
        const { data: admin, error } = await supabase
            .from('admin_users')
            .select('display_name')
            .eq('user_id', userId)
            .maybeSingle();

        if (error || !admin) {
            await supabase.auth.signOut();
            els.loginError.textContent = 'Access Denied: You are not authorized as an admin.';
            els.loginError.classList.remove('hidden');
            const btn = document.getElementById('btn-login-submit');
            btn.textContent = 'LOGIN';
            btn.disabled = false;
            return;
        }

        // Setup UI
        els.adminDisplayName.textContent = admin.display_name;
        els.modalLogin.classList.add('hidden');
        els.adminLayout.classList.remove('hidden');
        
        // Initialize dashboard
        bindNavigation();
        bindModals();
        bindActions();
        
        // Initial render
        loadOverview();
        loadSessionList();
        loadReportSessions(); // For the dropdown
    }

    // --- Navigation ---
    function bindNavigation() {
        els.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const view = item.getAttribute('data-view');
                switchView(view);
                
                els.navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');
                els.sidebar.classList.remove('open');
                
                if (view === 'overview') loadOverview();
                if (view === 'attendance') loadSessionList();
            });
        });

        els.linkBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const navTo = btn.getAttribute('data-nav');
                if (navTo === 'back-to-session') {
                    switchView('session-details');
                    loadSessionDetails(state.selectedSessionId);
                } else {
                    switchView(navTo);
                    els.navItems.forEach(n => {
                        if (n.getAttribute('data-view') === navTo) n.classList.add('active');
                        else n.classList.remove('active');
                    });
                    if (navTo === 'attendance') loadSessionList();
                }
            });
        });

        els.mobileBtn.addEventListener('click', () => els.sidebar.classList.add('open'));
        els.mobileCloseBtn.addEventListener('click', () => els.sidebar.classList.remove('open'));
    }

    function switchView(viewId) {
        state.currentView = viewId;
        els.views.forEach(v => v.classList.remove('active'));
        const target = document.getElementById(`view-${viewId}`);
        if (target) {
            target.classList.add('active');
            window.scrollTo(0, 0);
        }
    }

    // --- Modals ---
    function generateAttendanceCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like O/0, I/1
        let code = '';
        for(let i=0; i<6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    function bindModals() {
        const openStartSession = () => {
            els.modalStartSession.classList.remove('hidden');
            if (els.newSessionCode) {
                els.newSessionCode.value = generateAttendanceCode();
            }
        };

        if(els.btnStartSession) els.btnStartSession.addEventListener('click', openStartSession);
        if(els.btnStartSession2) els.btnStartSession2.addEventListener('click', openStartSession);
        
        if (els.btnGenerateCode) {
            els.btnGenerateCode.addEventListener('click', () => {
                els.newSessionCode.value = generateAttendanceCode();
            });
        }
        
        if(els.btnAddStudentManual) els.btnAddStudentManual.addEventListener('click', () => els.modalAddStudent.classList.remove('hidden'));
        
        els.modalCloseBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                els.modalStartSession.classList.add('hidden');
                els.modalAddStudent.classList.add('hidden');
            });
        });
        
        els.formStartSession.addEventListener('submit', async (e) => {
            e.preventDefault();
            const subject = document.getElementById('new-session-subject').value.trim();
            const dateInput = document.getElementById('new-session-date').value;
            const codeInput = document.getElementById('new-session-code').value.toUpperCase().trim();
            
            if (!subject || !dateInput || !codeInput) return;
            
            try {
                // Check for existing active session
                const { data: existingActive } = await supabase
                    .from('attendance_sessions')
                    .select('id')
                    .eq('status', 'open')
                    .limit(1);
                    
                if (existingActive && existingActive.length > 0) {
                    alert("An attendance session is already active.\n\nEnd the current session before starting another.");
                    return;
                }

                const { error } = await supabase
                    .from('attendance_sessions')
                    .insert([{
                        subject: subject,
                        attendance_date: dateInput,
                        attendance_code: codeInput,
                        status: 'open'
                    }]);

                if (error) throw error;
                
                els.modalStartSession.classList.add('hidden');
                els.formStartSession.reset();
                showToast('New attendance session started.');
                
                loadOverview();
                loadSessionList();
                
            } catch (err) {
                console.error(err);
                alert("Failed to start session. Please try again.");
            }
        });

        // Phase 7: Add Student Manually
        els.formAddStudent.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('add-student-name').value.trim();
            const roll = document.getElementById('add-student-roll').value.trim();
            const status = document.getElementById('add-student-status').value.toLowerCase();
            
            if (!state.selectedSessionId) return;

            try {
                let studentId;
                const { data: studentCheck } = await supabase
                    .from('students')
                    .select('id, name')
                    .eq('roll_number', roll)
                    .maybeSingle();

                if (studentCheck) {
                    studentId = studentCheck.id;
                    if (studentCheck.name !== name) {
                        await supabase.from('students').update({ name }).eq('id', studentId);
                    }
                } else {
                    const { data: newStudent, error: insertErr } = await supabase
                        .from('students')
                        .insert({ roll_number: roll, name: name })
                        .select('id')
                        .single();
                    if (insertErr) throw insertErr;
                    studentId = newStudent.id;
                }

                const { error: subErr } = await supabase
                    .from('attendance_submissions')
                    .insert({
                        session_id: state.selectedSessionId,
                        student_id: studentId,
                        photo_path: null,
                        status: status,
                        source: 'admin_added'
                    });

                if (subErr) {
                    if (subErr.code === '23505') {
                        alert("Student already has a submission for this session.");
                    } else {
                        throw subErr;
                    }
                } else {
                    els.modalAddStudent.classList.add('hidden');
                    els.formAddStudent.reset();
                    showToast('Student added manually.');
                    loadSessionDetails(state.selectedSessionId);
                }
            } catch (err) {
                console.error(err);
                alert("Failed to add student manually.");
            }
        });
    }

    // --- Actions ---
    function bindActions() {
        els.btnEndAttendance.addEventListener('click', async () => {
            if (!state.selectedSessionId) return;
            if (confirm("Are you sure you want to end this attendance session? Students will no longer be able to submit.")) {
                try {
                    const { error } = await supabase
                        .from('attendance_sessions')
                        .update({ 
                            status: 'ended',
                            ended_at: new Date().toISOString()
                        })
                        .eq('id', state.selectedSessionId);

                    if (error) throw error;
                    
                    showToast('Attendance session ended.');
                    loadSessionDetails(state.selectedSessionId);
                    loadOverview();
                    
                } catch (err) {
                    console.error(err);
                    alert("Failed to end session.");
                }
            }
        });

        els.btnDownloadPdf.addEventListener('click', () => {
            const selectEl = els.reportSessionSelect;
            if (!selectEl.value) return;
            const selectedText = selectEl.options[selectEl.selectedIndex].text;
            const [dateStr, ...subjectParts] = selectedText.split(' - ');
            generatePDFForSession(selectEl.value, subjectParts.join(' - '), dateStr);
        });

        if (els.btnDownloadPdfSession) {
            els.btnDownloadPdfSession.addEventListener('click', () => {
                generatePDFForSession(state.selectedSessionId, els.sdSubject.textContent, els.sdDate.textContent);
            });
        }

        // Phase 7: Review Actions
        els.btnMarkVerified.addEventListener('click', () => updateSubmissionStatus('verified'));
        els.btnMarkDuplicate.addEventListener('click', () => updateSubmissionStatus('duplicate'));
        
        els.btnViewStudentHistory.addEventListener('click', () => {
            if (state.selectedSubmission) {
                switchView('student-details');
                loadStudentDetails(state.selectedSubmission.students.roll_number, state.selectedSubmission.students.name);
            }
        });
    }

    async function loadReportSessions() {
        if (!els.reportSessionSelect) return;
        
        try {
            const { data, error } = await supabase
                .from('attendance_sessions')
                .select('id, subject, attendance_date, attendance_code')
                .order('attendance_date', { ascending: false });
                
            if (error) throw error;
            
            els.reportSessionSelect.innerHTML = '<option value="">-- Select a session --</option>';
            data.forEach(session => {
                const dateStr = new Date(session.attendance_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                els.reportSessionSelect.innerHTML += `<option value="${session.id}" data-code="${session.attendance_code || '-'}">${dateStr} - ${session.subject}</option>`;
            });
            
            els.reportSessionSelect.addEventListener('change', async (e) => {
                state.selectedSessionId = e.target.value;
                if (!e.target.value) {
                    els.reportStats.classList.add('hidden');
                    return;
                }
                
                const selectedOption = e.target.options[e.target.selectedIndex];
                els.rsCode.textContent = selectedOption.getAttribute('data-code') || '-';
                els.rsTotal.textContent = '...';
                els.rsVerified.textContent = '...';
                els.reportStats.classList.remove('hidden');
                
                try {
                    const { data: subs, error: subErr } = await supabase
                        .from('attendance_submissions')
                        .select('status')
                        .eq('session_id', e.target.value);
                        
                    if (subErr) throw subErr;
                    
                    els.rsTotal.textContent = subs.length;
                    els.rsVerified.textContent = subs.filter(s => s.status === 'verified').length;
                } catch(err) {
                    console.error("Failed to load stats", err);
                    els.rsTotal.textContent = 'Error';
                    els.rsVerified.textContent = 'Error';
                }
            });
            
        } catch (err) {
            console.error('Failed to load report sessions:', err);
            els.reportSessionSelect.innerHTML = '<option value="">Failed to load sessions</option>';
        }
    }

    async function generatePDFForSession(sessionId, subjectText, dateText) {
        if (!sessionId) {
            alert("No session selected.");
            return;
        }
        
        try {
            const { data: submissions, error } = await supabase
                .from('attendance_submissions')
                .select('students(roll_number, name)')
                .eq('session_id', sessionId)
                .eq('status', 'verified')
                .order('students(roll_number)', { ascending: true });
                
            if (error) throw error;
            
            if (!submissions || submissions.length === 0) {
                alert("No verified students found for this session.");
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            doc.setFontSize(16);
            doc.text(`Attendance Report: ${subjectText}`, 14, 20);
            doc.setFontSize(11);
            doc.text(`Date: ${dateText}`, 14, 28);
            doc.text(`Total Verified: ${submissions.length}`, 14, 34);

            const tableData = submissions.map(s => [s.students.roll_number, s.students.name]);

            doc.autoTable({
                startY: 40,
                head: [['Roll Number', 'Student Name']],
                body: tableData,
                theme: 'striped',
                headStyles: { fillColor: [15, 98, 254] }
            });

            const safeSubject = subjectText.replace(/[^a-zA-Z0-9]/g, '_');
            const safeDate = dateText.replace(/[^a-zA-Z0-9]/g, '_');
            doc.save(`Attendance_${safeSubject}_${safeDate}.pdf`);
            
        } catch (err) {
            console.error(err);
            alert("Failed to generate PDF.");
        }
    }

    async function updateSubmissionStatus(newStatus) {
        if (!state.selectedSubmission) return;
        
        try {
            const { error } = await supabase
                .from('attendance_submissions')
                .update({ status: newStatus })
                .eq('id', state.selectedSubmission.id);
                
            if (error) throw error;
            
            state.selectedSubmission.status = newStatus;
            renderSubmissionDetails(state.selectedSubmission);
            loadSessionDetails(state.selectedSessionId); // Refresh background list
            showToast(`Status updated to ${newStatus}.`);
        } catch (err) {
            console.error(err);
            alert("Failed to update status.");
        }
    }

    // --- Data Loading & Rendering ---

    async function loadOverview() {
        els.activeSessionBlock.innerHTML = `<p class="text-secondary">Loading...</p>`;
        
        try {
            const { data: sessions, error } = await supabase
                .from('attendance_sessions')
                .select('*')
                .eq('status', 'open')
                .order('created_at', { ascending: false })
                .limit(1);
                
            if (error) throw error;
            
            if (sessions && sessions.length > 0) {
                const activeSession = sessions[0];
                
                // Fetch stats for this session
                const { data: submissions, error: subError } = await supabase
                    .from('attendance_submissions')
                    .select('status')
                    .eq('session_id', activeSession.id);
                    
                if (subError) throw subError;
                
                const verified = submissions.filter(s => s.status === 'verified').length;
                const review = submissions.filter(s => s.status === 'duplicate').length;
                
                // Format Date UI
                const dateStr = new Date(activeSession.attendance_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                els.activeSessionBlock.innerHTML = `
                    <div class="info-block">
                        <span class="block-label">Active Session</span>
                        <h3 class="block-value" style="font-size:1.5rem;">${activeSession.subject}</h3>
                        <p class="text-secondary mt-1">${dateStr}</p>
                        <div class="status-badge status-open mt-3">OPEN</div>
                    </div>
                    <div class="info-block">
                        <span class="block-label">Total Submissions</span>
                        <h3 class="block-value">${submissions.length}</h3>
                    </div>
                    <div class="info-block">
                        <span class="block-label">Verified</span>
                        <h3 class="block-value text-success">${verified}</h3>
                    </div>
                    <div class="info-block">
                        <span class="block-label">Review Needed</span>
                        <h3 class="block-value text-warning">${review}</h3>
                    </div>
                `;
            } else {
                els.activeSessionBlock.innerHTML = `
                    <div class="info-block">
                        <span class="block-label">Active Session</span>
                        <p class="text-secondary mt-2">No active attendance session.</p>
                        <p class="text-sm text-secondary mt-1">Start a new session to begin.</p>
                    </div>
                `;
            }
        } catch (err) {
            console.error(err);
            els.activeSessionBlock.innerHTML = `<p class="text-secondary">Failed to load active session.</p>`;
        }
    }

    async function loadSessionList() {
        els.sessionListTbody.innerHTML = `<tr><td colspan="3" class="text-center text-secondary">Loading...</td></tr>`;
        
        try {
            const { data: sessions, error } = await supabase
                .from('attendance_sessions')
                .select('*')
                .order('attendance_date', { ascending: false })
                .order('created_at', { ascending: false });
                
            if (error) throw error;
            
            els.sessionListTbody.innerHTML = '';
            
            if (sessions.length === 0) {
                els.sessionListTbody.innerHTML = `<tr><td colspan="3" class="text-center text-secondary">No sessions found.</td></tr>`;
                return;
            }
            
            sessions.forEach(session => {
                const tr = document.createElement('tr');
                tr.className = 'clickable';
                
                let statusBadge = '';
                if (session.status === 'open') {
                    statusBadge = `<span class="status-badge open">ATTENDANCE OPEN</span>`;
                } else {
                    statusBadge = `<span class="status-badge expired">Ended</span>`;
                }
                
                const dateStr = new Date(session.attendance_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                
                tr.innerHTML = `
                    <td>${dateStr}</td>
                    <td class="font-medium">${session.subject}</td>
                    <td>${statusBadge}</td>
                `;
                
                tr.addEventListener('click', () => {
                    switchView('session-details');
                    loadSessionDetails(session.id);
                });
                
                els.sessionListTbody.appendChild(tr);
            });
            
        } catch (err) {
            console.error(err);
            els.sessionListTbody.innerHTML = `<tr><td colspan="3" class="text-center text-secondary">Failed to load sessions.</td></tr>`;
        }
    }

    async function loadSessionDetails(sessionId) {
        state.selectedSessionId = sessionId;
        els.sdStudentsTbody.innerHTML = `<tr><td colspan="5" class="text-center text-secondary">Loading...</td></tr>`;
        
        try {
            // Get session
            const { data: session, error: sErr } = await supabase
                .from('attendance_sessions')
                .select('*')
                .eq('id', sessionId)
                .single();
                
            if (sErr) throw sErr;
            
            // Format UI
            const dateStr = new Date(session.attendance_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            els.sdSubject.textContent = session.subject;
            els.sdDate.textContent = dateStr;
            els.sdCode.textContent = session.attendance_code || '-';
            
            if (session.status === 'open') {
                els.sdStatusBadge.className = 'status-badge open mt-2';
                els.sdStatusBadge.textContent = 'ATTENDANCE OPEN';
                els.btnEndAttendance.style.display = 'inline-flex';
            } else {
                els.sdStatusBadge.className = 'status-badge expired mt-2';
                els.sdStatusBadge.textContent = 'Session Ended';
                els.btnEndAttendance.style.display = 'none';
            }

            // Get submissions + student details
            const { data: submissions, error: subErr } = await supabase
                .from('attendance_submissions')
                .select('*, students(*)')
                .eq('session_id', sessionId)
                .order('submitted_at', { ascending: true });
                
            if (subErr) throw subErr;
            
            const verified = submissions.filter(s => s.status === 'verified').length;
            const duplicate = submissions.filter(s => s.status === 'duplicate').length;

            els.sdTotal.textContent = submissions.length;
            els.sdVerified.textContent = verified;
            els.sdReview.textContent = duplicate;
            
            els.sdStudentsTbody.innerHTML = '';
            
            if (submissions.length === 0) {
                els.sdStudentsTbody.innerHTML = `<tr><td colspan="5" class="text-center text-secondary">No submissions yet.</td></tr>`;
                return;
            }
            
            submissions.forEach(sub => {
                const tr = document.createElement('tr');
                
                let statusClass = 'verified';
                if(sub.status === 'duplicate') statusClass = 'duplicate';
                
                let actionBtnText = (sub.status === 'duplicate') ? 'Review' : 'View';
                
                const timeStr = new Date(sub.submitted_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                
                tr.innerHTML = `
                    <td><button class="link-btn" style="text-align: left;" onclick="event.preventDefault()">${sub.students.roll_number}</button></td>
                    <td><button class="link-btn font-medium" style="text-align: left;" onclick="event.preventDefault()">${sub.students.name}</button></td>
                    <td>${timeStr}</td>
                    <td><span class="status-badge ${statusClass}">${sub.status.toUpperCase()}</span></td>
                    <td><button class="link-btn action-btn">${actionBtnText}</button></td>
                `;
                
                // Student links
                const studLinks = tr.querySelectorAll('td > button:not(.action-btn)');
                studLinks.forEach(link => {
                    link.addEventListener('click', () => {
                        switchView('student-details');
                        loadStudentDetails(sub.students.roll_number, sub.students.name);
                    });
                });
                
                // Action link
                tr.querySelector('.action-btn').addEventListener('click', () => {
                    if (actionBtnText === 'Review') {
                        // For now, duplicate review and submission details share the same logic
                        // Phase 12 will handle side-by-side review
                        state.selectedSubmission = sub;
                        switchView('submission-details');
                        renderSubmissionDetails(sub);
                    } else {
                        state.selectedSubmission = sub;
                        switchView('submission-details');
                        renderSubmissionDetails(sub);
                    }
                });
                
                els.sdStudentsTbody.appendChild(tr);
            });
            
        } catch (err) {
            console.error(err);
            els.sdStudentsTbody.innerHTML = `<tr><td colspan="5" class="text-center text-secondary">Error loading session data.</td></tr>`;
        }
    }

    // Phase 8: Student Details
    async function loadStudentDetails(rollNumber, studentName) {
        els.studName.textContent = studentName;
        els.studRoll.textContent = rollNumber;
        els.studPresent.textContent = '...';
        els.studAbsent.textContent = '...';
        els.studPercent.textContent = '...';
        els.studHistoryTbody.innerHTML = `<tr><td colspan="3" class="text-center text-secondary">Loading...</td></tr>`;

        try {
            // Get student
            const { data: student, error: sErr } = await supabase
                .from('students')
                .select('id')
                .eq('roll_number', rollNumber)
                .single();
                
            if (sErr) throw sErr;

            // Get history joined with sessions
            const { data: history, error: hErr } = await supabase
                .from('attendance_submissions')
                .select('status, attendance_sessions(subject, attendance_date)')
                .eq('student_id', student.id)
                .order('submitted_at', { ascending: false });

            if (hErr) throw hErr;

            // Simple presence calculation based on total sessions globally
            const { count: totalSessions, error: countErr } = await supabase
                .from('attendance_sessions')
                .select('*', { count: 'exact', head: true });

            if (countErr) throw countErr;

            const presentCount = history.filter(h => h.status === 'verified').length;
            const absentCount = totalSessions - presentCount;
            const percent = totalSessions > 0 ? ((presentCount / totalSessions) * 100).toFixed(1) + '%' : '0%';

            els.studPresent.textContent = presentCount;
            els.studAbsent.textContent = absentCount;
            els.studPercent.textContent = percent;

            els.studHistoryTbody.innerHTML = '';
            
            if (history.length === 0) {
                els.studHistoryTbody.innerHTML = `<tr><td colspan="3" class="text-center text-secondary">No history found.</td></tr>`;
                return;
            }

            history.forEach(h => {
                const tr = document.createElement('tr');
                let statusBadge = h.status === 'verified' ? 'verified' : 'duplicate';
                
                const dateStr = new Date(h.attendance_sessions.attendance_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                
                tr.innerHTML = `
                    <td>${dateStr}</td>
                    <td>${h.attendance_sessions.subject}</td>
                    <td><span class="status-badge ${statusBadge}">${h.status.toUpperCase()}</span></td>
                `;
                els.studHistoryTbody.appendChild(tr);
            });

        } catch (err) {
            console.error(err);
            els.studHistoryTbody.innerHTML = `<tr><td colspan="3" class="text-center text-secondary">Error loading history.</td></tr>`;
        }
    }

    // Phase 9: Submission Details & Private Photo
    async function renderSubmissionDetails(sub) {
        els.subName.textContent = sub.students.name;
        els.subRoll.textContent = sub.students.roll_number;
        
        els.subSubject.textContent = els.sdSubject.textContent;
        els.subDate.textContent = els.sdDate.textContent;
        els.subTime.textContent = new Date(sub.submitted_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        els.subStatus.textContent = sub.status.toUpperCase();
        if (sub.status === 'verified') {
            els.subStatus.className = 'status-badge verified inline-flex mt-1';
        } else {
            els.subStatus.className = 'status-badge duplicate inline-flex mt-1';
        }

        const photoContainer = document.querySelector('.submission-photo .photo-frame');
        
        if (sub.photo_path) {
            photoContainer.innerHTML = '<p class="text-secondary text-sm">Loading image...</p>';
            try {
                // Generate short-lived signed URL (60 seconds)
                const { data, error } = await supabase.storage
                    .from('blackboard-photos')
                    .createSignedUrl(sub.photo_path, 60);

                if (error) throw error;

                const fileName = sub.photo_path.split('/').pop();
                photoContainer.innerHTML = `
                    <div style="width: 100%; height: 200px; background-color: #EEE; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        <img src="${data.signedUrl}" alt="Blackboard Photo" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                    </div>
                    <p class="text-xs text-secondary mt-2">${fileName}</p>
                `;
            } catch (err) {
                console.error(err);
                photoContainer.innerHTML = '<p class="text-danger text-sm">Failed to load photo.</p>';
            }
        } else {
            // Admin added, no photo
            photoContainer.innerHTML = `
                <div class="mock-image" style="background-color: #EEE;">
                    <span class="text-secondary">No photo provided<br>(Admin Added)</span>
                </div>
            `;
        }
    }

    function renderDuplicateReview() {
        // Will be implemented later
        if(els.reviewContainer) els.reviewContainer.innerHTML = '<p class="text-secondary">Duplicate detection not yet implemented.</p>';
    }

    // --- Utils ---
    function showToast(message) {
        // Simple fallback since I removed the toast element from HTML
        console.log("Admin Action:", message);
        alert(message);
    }
});
