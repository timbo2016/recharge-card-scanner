const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const scanButton = document.getElementById('scanButton');
const dialButton = document.getElementById('dialButton');
const clearResultsButton = document.getElementById('clearResultsButton');
const resultText = document.getElementById('resultText');
const mobileNumberInput = document.getElementById('mobileNumber');
const clearMobileButton = document.getElementById('clearMobile');
const loadingIndicator = document.getElementById('loadingIndicator');
const capturedImage = document.getElementById('capturedImage');
const zoomSlider = document.getElementById('zoomSlider');

let stream = null;
let imageCapture = null;
let rechargeKey = null;

scanButton.addEventListener('click', startScanning);
dialButton.addEventListener('click', dialUSSD);
clearResultsButton.addEventListener('click', clearResults);
clearMobileButton.addEventListener('click', () => clearInput(mobileNumberInput));
mobileNumberInput.addEventListener('input', updateDialButtonState);
zoomSlider.addEventListener('input', updateZoom);

async function startScanning() {
    console.log('startScanning function called');
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
        });
        console.log('Camera access granted');
        video.srcObject = stream;
        await video.play();
        console.log('Video playback started');
        const mediaStreamTrack = stream.getVideoTracks()[0];
        imageCapture = new ImageCapture(mediaStreamTrack);
        console.log(imageCapture);
        setZoomCapabilities(mediaStreamTrack);
        scanButton.textContent = 'Capture';
        scanButton.removeEventListener('click', startScanning);
        scanButton.addEventListener('click', captureImage);
    } catch (err) {
        console.error('Error accessing camera:', err);
        handleError('Error accessing camera', err);
    }
}

function setZoomCapabilities(mediaStreamTrack) {
    const capabilities = mediaStreamTrack.getCapabilities();
    const settings = mediaStreamTrack.getSettings();
    if (capabilities.zoom) {
        zoomSlider.min = capabilities.zoom.min;
        zoomSlider.max = capabilities.zoom.max;
        zoomSlider.step = capabilities.zoom.step;
        zoomSlider.value = settings.zoom;
    }
}

function updateZoom() {
    const mediaStreamTrack = stream.getVideoTracks()[0];
    mediaStreamTrack.applyConstraints({ advanced: [{ zoom: zoomSlider.value }] })
        .catch(error => console.error('applyConstraints() error:', error));
}

function captureImage() {
    imageCapture.takePhoto()
        .then(blob => {
            capturedImage.src = URL.createObjectURL(blob);
            capturedImage.style.display = 'block';
            capturedImage.onload = () => { URL.revokeObjectURL(capturedImage.src); }
            performOCR(blob);
        })
        .catch(error => handleError('Error capturing image', error));
}

async function performOCR(blob) {
    resultText.textContent = 'Processing...';
    loadingIndicator.style.display = 'inline-block';
    dialButton.disabled = true;
    clearResultsButton.style.display = 'none';
    
    try {
        const imageBitmap = await createImageBitmap(blob);
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        canvas.getContext('2d').drawImage(imageBitmap, 0, 0);
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        const result = await Tesseract.recognize(imageDataUrl, 'eng', {
            logger: m => console.log(m)
        });
        
        const text = result.data.text.trim();
        rechargeKey = extractRechargeKey(text);
        
        if (rechargeKey) {
            resultText.textContent = `Recharge Key: ${rechargeKey}`;
            updateDialButtonState();
        } else {
            resultText.textContent = 'No valid recharge key found. Please try again.';
            dialButton.disabled = true;
        }
    } catch (err) {
        handleError('OCR Error', err);
        dialButton.disabled = true;
    } finally {
        loadingIndicator.style.display = 'none';
        updateDialButtonState();
    }
}

function extractRechargeKey(text) {
    // Adjust the regex pattern based on your specific recharge key format
    const match = text.match(/\b\d{12,16}\b/);
    return match ? match[0] : null;
}

function dialUSSD() {
    const mobileNumber = mobileNumberInput.value.trim();
    
    if (!validateInputs(rechargeKey, mobileNumber)) {
        return;
    }
    
    const ussdCode = `*121*${rechargeKey}*${mobileNumber}#`;
    console.log(`Dialing USSD code: ${ussdCode}`);
    
    try {
        window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
        resultText.textContent = `Dialing: ${ussdCode}`;
    } catch (err) {
        handleError('Error initiating call', err);
    }
}

function validateInputs(rechargeKey, mobileNumber) {
    if (!rechargeKey) {
        showError('Please scan a recharge card first.');
        return false;
    }
    
    if (!mobileNumber) {
        showError('Please enter a mobile number.');
        return false;
    }
    
    // Validate phone number format: 077xxxxxxx or 078xxxxxxx
    const phoneNumberPattern = /^(077|078)\d{7}$/;
    if (!phoneNumberPattern.test(mobileNumber)) {
        showError('Invalid mobile number. Please enter a valid number in the format 077xxxxxxx or 078xxxxxxx.');
        return false;
    }
    
    return true;
}

function updateDialButtonState() {
    const mobileNumber = mobileNumberInput.value.trim();
    const isDialButtonEnabled = rechargeKey && mobileNumber && /^(077|078)\d{7}$/.test(mobileNumber);
    dialButton.disabled = !isDialButtonEnabled;
    console.log(`Dial button state updated: ${isDialButtonEnabled ? 'enabled' : 'disabled'}`);
    clearResultsButton.style.display = rechargeKey ? 'block' : 'none';
}

function handleError(message, error) {
    console.error(`${message}:`, error);
    let errorMessage = `${message}. `;
    if (error.name === 'NotAllowedError') {
        errorMessage += 'Camera permission was denied. Please grant camera access and try again.';
    } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera found on your device.';
    } else if (error.name === 'NotReadableError') {
        errorMessage += 'Camera is already in use by another application.';
    } else if (error.name === 'OverconstrainedError') {
        errorMessage += 'Camera does not satisfy the resolution constraints.';
    } else {
        errorMessage += `Error: ${error.message}`;
    }
    showError(errorMessage);
}

function showError(message) {
    resultText.textContent = message;
}

function clearInput(input) {
    input.value = '';
    updateDialButtonState();
}

function clearResults() {
    rechargeKey = null;
    resultText.textContent = '';
    dialButton.disabled = true;
    updateDialButtonState();
}

// Check for camera support
function checkCameraSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Your browser does not support camera access. Please use a modern browser.');
        scanButton.disabled = true;
    }
}

// Call this function when the page loads
window.addEventListener('load', checkCameraSupport);

// Add touch event listeners for better mobile interaction
scanButton.addEventListener('touchstart', function(e) {
    e.preventDefault();
    this.style.backgroundColor = '#3a7bc8';
});

scanButton.addEventListener('touchend', function(e) {
    e.preventDefault();
    this.style.backgroundColor = '';
});

dialButton.addEventListener('touchstart', function(e) {
    if (!this.disabled) {
        e.preventDefault();
        this.style.backgroundColor = '#3a7bc8';
    }
});

dialButton.addEventListener('touchend', function(e) {
    if (!this.disabled) {
        e.preventDefault();
        this.style.backgroundColor = '';
    }
});

// Prevent zooming on double-tap for iOS devices
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Add touch event listener for the clear results button
clearResultsButton.addEventListener('touchstart', function(e) {
    e.preventDefault();
    this.style.backgroundColor = '#d0d0d0';
});

clearResultsButton.addEventListener('touchend', function(e) {
    e.preventDefault();
    this.style.backgroundColor = '';
});
