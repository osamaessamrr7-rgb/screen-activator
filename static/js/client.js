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
    }, 4000);
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function openStatusModal() {
    openModal('statusModal');
    setTimeout(() => {
        document.getElementById('statusSearchInput').focus();
    }, 150);
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const btn = document.getElementById('submitBtn');
    const client_name = document.getElementById('client_name').value.trim();
    const phone_number = document.getElementById('phone_number').value.trim();
    const app_name = document.getElementById('app_name').value;
    const screen_code = document.getElementById('screen_code').value.trim().toUpperCase();
    const notes = document.getElementById('notes').value.trim();

    if (!client_name || !phone_number || !screen_code || !app_name) {
        showToast('يرجى ملء جميع الحقول المطلوبة.', 'error');
        return;
    }

    const originalBtnHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال والتسجيل...';

    try {
        const response = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_name,
                phone_number,
                screen_code,
                app_name,
                notes
            })
        });

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            document.getElementById('activationForm').reset();
            document.getElementById('successCodeDisplay').innerText = data.screen_code;
            openModal('successModal');
            showToast('تم إرسال كود شاشتك بنجاح!', 'success');
        } else if (data.status === 'warning') {
            showToast(data.message, 'info');
        } else {
            showToast(data.message || 'حدث خطأ أثناء إرسال الكود.', 'error');
        }
    } catch (err) {
        showToast('فشل الاتصال بالسيرفر. يرجى المحاولة مجدداً.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
    }
}

async function lookupStatus() {
    const input = document.getElementById('statusSearchInput');
    const term = input.value.trim();
    const resultsArea = document.getElementById('statusResultsArea');

    if (!term) {
        showToast('أدخل كود الشاشة أو رقم الهاتف للبحث.', 'error');
        return;
    }

    resultsArea.innerHTML = '<div style="text-align:center; padding: 25px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: var(--primary);"></i><p style="margin-top: 10px; color: var(--text-secondary); font-size: 13px;">جاري البحث عن طلبك...</p></div>';

    try {
        const res = await fetch(`/api/status/${encodeURIComponent(term)}`);
        const data = await res.json();

        if (res.ok && data.status === 'success') {
            let html = '<div class="status-timeline">';
            data.results.forEach(item => {
                let badgeClass = 'badge-pending';
                let statusLabel = 'قيد الانتظار والمراجعة';
                let icon = 'fa-clock';

                if (item.status === 'activated') {
                    badgeClass = 'badge-activated';
                    statusLabel = 'تم التفعيل بنجاح! جاهز الآن';
                    icon = 'fa-circle-check';
                } else if (item.status === 'rejected') {
                    badgeClass = 'badge-rejected';
                    statusLabel = 'مرفوض / كود غير صحيح';
                    icon = 'fa-circle-xmark';
                }

                html += `
                    <div class="status-item-card">
                        <div class="status-header-row">
                            <span class="code-cell">${item.screen_code}</span>
                            <span class="badge ${badgeClass}"><i class="fa-solid ${icon}"></i> ${statusLabel}</span>
                        </div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px;">
                            <span><strong>التطبيق:</strong> ${item.app_name}</span> &bull; 
                            <span><strong>الاسم:</strong> ${item.client_name}</span>
                        </div>
                        ${item.admin_notes ? `<div style="font-size: 12px; color: var(--warning); background: rgba(245, 158, 11, 0.1); padding: 6px 10px; border-radius: 6px; margin-top: 6px;"><strong>ملاحظة الإدارة:</strong> ${item.admin_notes}</div>` : ''}
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
                            تاريخ الطلب: ${item.created_at}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            resultsArea.innerHTML = html;
        } else {
            resultsArea.innerHTML = `
                <div style="text-align:center; padding: 25px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 28px; color: var(--warning); margin-bottom: 10px;"></i>
                    <p style="color: var(--text-secondary); font-size: 14px;">${data.message || 'لم يتم العثور على أي نتائج مسجلة.'}</p>
                </div>
            `;
        }
    } catch (err) {
        resultsArea.innerHTML = '<p style="color: var(--danger); text-align: center; padding: 20px;">تعذر الاتصال بقاعدة البيانات.</p>';
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal('successModal');
        closeModal('statusModal');
    }
});
