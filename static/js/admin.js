let authToken = localStorage.getItem('screen_admin_token') || '';
let currentFilter = 'all';
let currentSearch = '';
let autoRefreshTimer = null;
let allSubmissions = [];
let selectedIds = new Set();
let previousPendingCount = 0;

// Web Audio API beep sound
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
        // audio context blocked or unsupported
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-circle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function checkAuth() {
    if (authToken) {
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('dashboardApp').style.display = 'block';
        loadDashboardData();
        startAutoRefresh();
    } else {
        document.getElementById('loginScreen').classList.add('active');
        document.getElementById('dashboardApp').style.display = 'none';
        stopAutoRefresh();
    }
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const input = document.getElementById('adminPasswordInput');
    const password = input.value.trim();

    if (!password) return;

    try {
        const formData = new FormData();
        formData.append('password', password);

        const res = await fetch('/api/admin/login', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        if (res.ok && data.status === 'success') {
            authToken = data.token;
            localStorage.setItem('screen_admin_token', authToken);
            checkAuth();
            showToast('تم تسجيل الدخول بنجاح.', 'success');
        } else {
            showToast(data.message || 'كلمة المرور غير صحيحة.', 'error');
        }
    } catch (err) {
        showToast('تعذر الاتصال بالسيرفر.', 'error');
    }
}

function adminLogout() {
    localStorage.removeItem('screen_admin_token');
    authToken = '';
    checkAuth();
}

function getAuthHeaders() {
    return {
        'Authorization': `Bearer ${authToken}`
    };
}

async function loadDashboardData() {
    if (!authToken) return;

    try {
        // 1. Load Stats
        const statsRes = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
        if (statsRes.status === 401) {
            adminLogout();
            return;
        }
        const stats = await statsRes.json();
        document.getElementById('statTotal').innerText = stats.total;
        document.getElementById('statPending').innerText = stats.pending;
        document.getElementById('statActivated').innerText = stats.activated;
        document.getElementById('statToday').innerText = stats.today;
        
        document.getElementById('btnPendingCount').innerText = stats.pending;
        document.getElementById('countPending').innerText = stats.pending;
        document.getElementById('countAll').innerText = stats.total;
        document.getElementById('countActivated').innerText = stats.activated;

        if (stats.pending > previousPendingCount && previousPendingCount !== 0) {
            playNotificationSound();
            showToast(`تم استقبال ${stats.pending - previousPendingCount} كود شاشة جديد!`, 'info');
        }
        previousPendingCount = stats.pending;

        // 2. Load Submissions
        let url = `/api/admin/submissions?status_filter=${currentFilter}`;
        if (currentSearch) {
            url += `&search=${encodeURIComponent(currentSearch)}`;
        }

        const subRes = await fetch(url, { headers: getAuthHeaders() });
        const subData = await subRes.json();

        if (subRes.ok && subData.status === 'success') {
            allSubmissions = subData.data;
            renderTable(allSubmissions);
        }
    } catch (e) {
        console.error('Error loading dashboard data:', e);
    }
}

function renderTable(items) {
    const tbody = document.getElementById('submissionsTableBody');

    if (!items || items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    <i class="fa-solid fa-inbox empty-state-icon"></i>
                    <p>لا توجد طلبات مسجلة حالياً تطابق الفلتر المحدد.</p>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    items.forEach(item => {
        let badgeClass = 'badge-pending';
        let statusLabel = 'قيد الانتظار';
        let icon = 'fa-clock';

        if (item.status === 'activated') {
            badgeClass = 'badge-activated';
            statusLabel = 'تم التفعيل';
            icon = 'fa-check';
        } else if (item.status === 'rejected') {
            badgeClass = 'badge-rejected';
            statusLabel = 'مرفوض';
            icon = 'fa-xmark';
        }

        // WhatsApp clean phone
        let rawPhone = item.phone_number.replace(/[^0-9]/g, '');
        if (rawPhone.startsWith('01')) {
            rawPhone = '2' + rawPhone; // Egyptian default if local
        }
        const waUrl = `https://wa.me/${rawPhone}`;

        const isChecked = selectedIds.has(item.id) ? 'checked' : '';

        html += `
            <tr data-id="${item.id}">
                <td>
                    <input type="checkbox" class="row-checkbox" value="${item.id}" ${isChecked} onchange="toggleSelectRow(${item.id}, this.checked)">
                </td>
                <td>
                    <strong>${escapeHtml(item.client_name)}</strong>
                </td>
                <td>
                    <a href="${waUrl}" target="_blank" class="whatsapp-link" title="مراسلة العميل على واتساب">
                        <i class="fa-brands fa-whatsapp"></i>
                        <span>${escapeHtml(item.phone_number)}</span>
                    </a>
                </td>
                <td>
                    <span class="code-cell">
                        ${escapeHtml(item.screen_code)}
                        <button class="btn-mini-copy" onclick="copySingleCode('${escapeHtml(item.screen_code)}')" title="نسخ الكود">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                    </span>
                </td>
                <td>
                    <span style="font-weight: 600; color: #cbd5e1;">${escapeHtml(item.app_name)}</span>
                </td>
                <td style="max-width: 180px; font-size: 12px; color: var(--text-secondary);">
                    ${escapeHtml(item.notes) || '<span style="color:var(--text-muted);">-</span>'}
                </td>
                <td style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">
                    ${item.created_at}
                </td>
                <td>
                    <span class="badge ${badgeClass}">
                        <i class="fa-solid ${icon}"></i>
                        ${statusLabel}
                    </span>
                </td>
                <td>
                    <div class="row-actions" style="justify-content: center;">
                        ${item.status !== 'activated' ? `
                            <button class="btn-row-action activate" onclick="updateItemStatus(${item.id}, 'activated')" title="تفعيل الكود">
                                <i class="fa-solid fa-check"></i>
                            </button>
                        ` : `
                            <button class="btn-row-action" onclick="updateItemStatus(${item.id}, 'pending')" title="إعادة إلى قيد الانتظار" style="color: var(--warning);">
                                <i class="fa-solid fa-rotate-left"></i>
                            </button>
                        `}
                        ${item.status !== 'rejected' ? `
                            <button class="btn-row-action delete" onclick="updateItemStatus(${item.id}, 'rejected')" title="رفض الطلب">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        ` : ''}
                        <button class="btn-row-action delete" onclick="deleteItem(${item.id})" title="حذف السجل نهائياً">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    updateBatchFloatingState();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

async function copyAllPendingCodes() {
    try {
        const res = await fetch('/api/admin/pending-codes', { headers: getAuthHeaders() });
        const data = await res.json();

        if (res.ok && data.status === 'success') {
            if (data.codes.length === 0) {
                showToast('لا توجد أكواد معلقة حالياً لنسخها.', 'info');
                return;
            }

            const cleanText = data.codes.join('\n');
            await navigator.clipboard.writeText(cleanText);
            showToast(`تم نسخ ${data.count} كود معلق إلى الحافظة بنجاح!`, 'success');
        }
    } catch (e) {
        showToast('فشل نسخ الأكواد إلى الحافظة.', 'error');
    }
}

async function copySingleCode(code) {
    try {
        await navigator.clipboard.writeText(code);
        showToast(`تم نسخ الكود: ${code}`, 'success');
    } catch (e) {
        showToast('فشل النسخ.', 'error');
    }
}

function confirmActivateAll() {
    const pendingCount = parseInt(document.getElementById('statPending').innerText, 10) || 0;
    if (pendingCount === 0) {
        showToast('لا توجد أي أكواد معلقة لتفعيلها.', 'info');
        return;
    }
    document.getElementById('modalPendingCount').innerText = pendingCount;
    openModal('activateAllModal');
}

async function executeActivateAll() {
    closeModal('activateAllModal');
    try {
        const res = await fetch('/api/admin/activate-all-pending', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            showToast(data.message, 'success');
            loadDashboardData();
        } else {
            showToast('حدث خطأ أثناء التفعيل.', 'error');
        }
    } catch (e) {
        showToast('فشل الاتصال بالسيرفر.', 'error');
    }
}

async function updateItemStatus(id, newStatus) {
    try {
        const res = await fetch('/api/admin/update-item', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, status: newStatus })
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            showToast('تم تحديث حالة الكود.', 'success');
            loadDashboardData();
        }
    } catch (e) {
        showToast('فشل التحديث.', 'error');
    }
}

async function deleteItem(id) {
    if (!confirm('هل أنت متأكد من حذف هذا السجل نهائياً؟')) return;

    try {
        const res = await fetch(`/api/admin/delete/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            showToast('تم حذف السجل بنجاح.', 'success');
            selectedIds.delete(id);
            loadDashboardData();
        }
    } catch (e) {
        showToast('فشل الحذف.', 'error');
    }
}

function setFilter(filter, el) {
    currentFilter = filter;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    loadDashboardData();
}

let searchDebounce = null;
function handleSearch(val) {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        currentSearch = val;
        loadDashboardData();
    }, 250);
}

function toggleSelectRow(id, isChecked) {
    if (isChecked) {
        selectedIds.add(id);
    } else {
        selectedIds.delete(id);
    }
    updateBatchFloatingState();
}

function toggleSelectAll(isChecked) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        const id = parseInt(cb.value, 10);
        if (isChecked) selectedIds.add(id);
        else selectedIds.delete(id);
    });
    updateBatchFloatingState();
}

function clearSelection() {
    selectedIds.clear();
    const selectAllCb = document.getElementById('selectAllCheckbox');
    if (selectAllCb) selectAllCb.checked = false;
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
    updateBatchFloatingState();
}

function updateBatchFloatingState() {
    const bar = document.getElementById('batchActionFloating');
    const countEl = document.getElementById('selectedCount');
    if (selectedIds.size > 0) {
        countEl.innerText = selectedIds.size;
        bar.style.display = 'flex';
    } else {
        bar.style.display = 'none';
    }
}

async function batchUpdateSelected(newStatus) {
    if (selectedIds.size === 0) return;
    try {
        const res = await fetch('/api/admin/batch-update-status', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ids: Array.from(selectedIds),
                status: newStatus
            })
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            showToast(`تم تحديث ${data.affected} عنصر بنجاح!`, 'success');
            clearSelection();
            loadDashboardData();
        }
    } catch (e) {
        showToast('فشل التحديث الجماعي.', 'error');
    }
}

function exportData(format) {
    if (format === 'txt') {
        window.open(`/api/admin/export/txt?mode=${currentFilter === 'pending' ? 'pending' : 'all'}`, '_blank');
    } else if (format === 'csv') {
        window.open('/api/admin/export/csv', '_blank');
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(() => {
        loadDashboardData();
    }, 10000); // every 10 seconds
}

function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
}

function toggleAutoRefresh(enabled) {
    if (enabled) {
        startAutoRefresh();
        showToast('تم تفعيل التحديث التلقائي.', 'info');
    } else {
        stopAutoRefresh();
        showToast('تم إيقاف التحديث التلقائي.', 'info');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});
