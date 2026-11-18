/**
 * Shared profile-photo helper for every role.
 * upload(file) sends the image to /api/uploads/avatar (Cloudinary) and resolves to the hosted URL.
 * show(el, url, initials, color) draws the photo, or the initials when there is no photo.
 */
(function () {
    const MAX_BYTES = 3 * 1024 * 1024;

    function readAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not read the image file.'));
            reader.readAsDataURL(file);
        });
    }

    async function upload(file) {
        if (!file || !file.type.startsWith('image/')) throw new Error('Please select a valid image file (PNG, JPG, WebP).');
        if (file.size > MAX_BYTES) throw new Error('Image file size must be under 3MB.');
        const image = await readAsDataUrl(file);
        const res = await fetch('api/uploads/avatar.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.status !== 'success' || !data.url) {
            throw new Error(data.message || 'Could not upload the photo.');
        }
        return data.url;
    }

    function show(el, url, initials, color) {
        if (!el) return;
        el.innerHTML = '';
        if (url && /^https:\/\//.test(url)) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Profile photo';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;';
            img.onerror = () => { el.innerHTML = ''; el.textContent = initials || ''; };
            el.appendChild(img);
        } else {
            el.textContent = initials || '';
        }
        if (color) el.style.backgroundColor = color;
    }

    window.OptiDentAvatar = { upload, show };
})();
