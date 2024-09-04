const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const startButton = document.getElementById('startButton');
const captureButton = document.getElementById('captureButton');
const dialButton = document.getElementById('dialButton');
const clearResultsButton = document.getElementById('clearResultsButton');
const resultText = document.getElementById('resultText');
const mobileNumberInput = document.getElementById('mobileNumber');
const clearMobileButton = document.getElementById('clearMobile');
const loadingIndicator = document.getElementById('loadingIndicator');
const capturedImage = document.getElementById('capturedImage');

let stream = null;
let imageCapture = null;
let rechargeKey = null;

startButton.addEventListener('click', startCamera);
captureButton.addEventListener('click', captureImage);
dialButton.addEventListener('click', dialUSSD);
clearResultsButton.addEventListener('click', clearResults);
clearMobileButton.addEventListener('click', () => clearInput(mobileNumberInput));
mobileNumberInput.addEventListener('input', updateDialButtonState);

// New event listeners
resolutionSelect.addEventListener('change', updateResolution);
zoomSlider.addEventListener('input', updateZoom);

function checkTesseractAvailability() {
    if (typeof Tesseract === 'undefined') {
        console.error('Tesseract is not defined. Make sure the library is properly loaded.');
        showError('OCR library not loaded. Please refresh the page or check your internet connection.');
        return false;
    }
    return true;
}

async function performOCR(blob) {
    if (!checkTesseractAvailability()) return;

    resultText.textContent = 'Processing...';
    loadingIndicator.style.display = 'inline-block';
    dialButton.disabled = true;

    try {
        console.log('Starting OCR process...');
        const result = await Tesseract.recognize(blob, 'eng', {
            logger: m => console.log('Tesseract log:', m),
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
            tessedit_pageseg_mode: '6', // Assume a single uniform block of text
            preprocess_type: '3', // More aggressive preprocessing
            image_preprocessing_type: '2', // Additional image preprocessing
        });
        
        console.log('OCR Result:', result.data.text);
        const text = result.data.text.trim();
        rechargeKey = extractRechargeKey(text);
        
        if (rechargeKey) {
            resultText.textContent = `Recharge Key: ${rechargeKey}`;
            updateDialButtonState();
        } else {
            resultText.textContent = 'No valid 17-digit recharge key found. Please try again.';
            resultText.textContent += `\n\nDebug Info:\nDetected Text: ${text}`;
            dialButton.disabled = true;
        }
    } catch (error) {
        console.error('OCR Error:', error);
        showError(`Failed to process the image. Error: ${error.message}`);
        dialButton.disabled = true;
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function extractRechargeKey(text) {
    console.log('Extracting recharge key from:', text);
    
    // Define common OCR misreadings
    const substitutions = {
        'O': '0', 'o': '0', 'Q': '0', 'D': '0',
        'I': '1', 'l': '1', 'i': '1',
        'Z': '2', 'z': '2',
        'A': '4',
        'S': '5', 's': '5',
        'G': '6', 'b': '6',
        'T': '7',
        'B': '8',
        'g': '9', 'q': '9'
    };

    // Function to apply substitutions
    function applySubstitutions(str) {
        return str.split('').map(char => substitutions[char] || char).join('');
    }

    // Clean and normalize the text
    const cleanedText = text.replace(/[^0-9A-Za-z]/g, '');
    const normalizedText = applySubstitutions(cleanedText);

    console.log('Normalized text:', normalizedText);

    // Look for exact 17-digit sequences
    const exactMatches = normalizedText.match(/\d{17}/g) || [];
    if (exactMatches.length > 0) {
        console.log('Found exact 17-digit match:', exactMatches[0]);
        return exactMatches[0];
    }

    // If no exact match, look for close matches
    const closeMatches = normalizedText.match(/\d{15,19}/g) || [];
    console.log('Close matches:', closeMatches);

    // Filter and sort close matches
    const potentialKeys = closeMatches
        .filter(match => Math.abs(match.length - 17) <= 2) // Allow for 15-19 digit sequences
        .sort((a, b) => Math.abs(a.length - 17) - Math.abs(b.length - 17)); // Sort by closeness to 17 digits

    if (potentialKeys.length > 0) {
        const bestMatch = potentialKeys[0];
        console.log('Best potential match:', bestMatch);
        
        // If it's not exactly 17 digits, pad or trim as necessary
        if (bestMatch.length < 17) {
            return bestMatch.padEnd(17, '0');
        } else if (bestMatch.length > 17) {
            return bestMatch.slice(0, 17);
        } else {
            return bestMatch;
        }
    }

    console.log('No valid recharge key found');
    return null;
}

async function startCamera() {
    try {
        const constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } else if (navigator.getUserMedia) {
            stream = await new Promise((resolve, reject) => {
                navigator.getUserMedia(constraints, resolve, reject);
            });
        } else if (navigator.webkitGetUserMedia) {
            stream = await new Promise((resolve, reject) => {
                navigator.webkitGetUserMedia(constraints, resolve, reject);
            });
        } else if (navigator.mozGetUserMedia) {
            stream = await new Promise((resolve, reject) => {
                navigator.mozGetUserMedia(constraints, resolve, reject);
            });
        } else {
            throw new Error('getUserMedia is not supported in this browser');
        }

        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        imageCapture = new ImageCapture(track);

        startButton.disabled = true;
        captureButton.disabled = false;

        updateCameraCapabilities();
        console.log('Camera started successfully');
    } catch (error) {
        console.error('Error starting camera:', error);
        showError(`Failed to start camera: ${error.message}. Please make sure you have granted camera permissions.`);
    }
}

async function updateCameraCapabilities() {
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    const settings = track.getSettings();

    // Update resolution options
    if (capabilities.width && capabilities.height) {
        resolutionSelect.innerHTML = '';
        const resolutions = [
            { width: 640, height: 480 },
            { width: 1280, height: 720 },
            { width: 1920, height: 1080 }
        ];
        resolutions.forEach(res => {
            if (res.width <= capabilities.width.max && res.height <= capabilities.height.max) {
                const option = document.createElement('option');
                option.value = `${res.width}x${res.height}`;
                option.text = `${res.width}x${res.height}`;
                resolutionSelect.add(option);
            }
        });
        resolutionSelect.value = `${settings.width}x${settings.height}`;
    } else {
        resolutionSelect.disabled = true;
    }

    if (capabilities.zoom) {
        zoomSlider.min = capabilities.zoom.min;
        zoomSlider.max = capabilities.zoom.max;
        zoomSlider.step = capabilities.zoom.step;
        zoomSlider.value = settings.zoom;
        zoomSlider.disabled = false;
    } else {
        zoomSlider.disabled = true;
    }
}

async function updateResolution() {
    const [width, height] = resolutionSelect.value.split('x').map(Number);
    const track = stream.getVideoTracks()[0];
    await track.applyConstraints({ width, height });
}

async function updateZoom() {
    const track = stream.getVideoTracks()[0];
    await track.applyConstraints({ advanced: [{ zoom: Number(zoomSlider.value) }] });
}

async function captureImage() {
    try {
        let imageBlob;
        if (imageCapture && imageCapture.takePhoto) {
            const photoSettings = {
                imageHeight: Number(resolutionSelect.value.split('x')[1]),
                imageWidth: Number(resolutionSelect.value.split('x')[0])
            };
            imageBlob = await imageCapture.takePhoto(photoSettings);
        } else {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
        }
        
        capturedImage.src = URL.createObjectURL(imageBlob);
        capturedImage.style.display = 'block';
        capturedImage.onload = () => URL.revokeObjectURL(capturedImage.src);
        performOCR(imageBlob);
    } catch (error) {
        console.error('Error capturing image:', error);
        showError('Failed to capture image. Please try again.');
    }
}

function dialUSSD() {
    const mobileNumber = mobileNumberInput.value.trim();
    
    if (!validateInputs(rechargeKey, mobileNumber)) {
        return;
    }
    
    const ussdCode = `*121*${rechargeKey}*${mobileNumber}#`;
    console.log(`Dialing USSD code: ${ussdCode}`);
    
    window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
    resultText.textContent = `Dialing: ${ussdCode}`;
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
}

function showError(message) {
    resultText.textContent = message;
    resultText.classList.add('error');
}

function clearInput(input) {
    input.value = '';
    updateDialButtonState();
}

function clearResults() {
    rechargeKey = null;
    resultText.textContent = '';
    dialButton.disabled = true;
    capturedImage.style.display = 'none';
    updateDialButtonState();
}

window.addEventListener('load', checkCameraSupport);

function checkCameraSupport() {
    if (!navigator.mediaDevices && !navigator.getUserMedia && !navigator.webkitGetUserMedia && !navigator.mozGetUserMedia) {
        showError('Your browser does not support camera access. Please use a modern browser.');
        startButton.disabled = true;
    }
}

let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

