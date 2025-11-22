// app.js
// initialize firebase (firebase-config.js must be included first)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// Login & signup
async function login() {
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    window.location = 'dashboard.html';
  } catch (e) {
    alert('Login failed: ' + e.message);
  }
}
async function signup(email, pass) {
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
    alert('User created. Login now.');
  } catch (e) {
    alert('Signup: ' + e.message);
  }
}

// Acknowledge alarm (writes to Alerts to clear)
function acknowledge(type) {
  if (type === 'temperature') {
    db.ref('/Alerts/temperatureAlert').set('ACK');
    showTransientNotif('Temperature alarm acknowledged');
  } else if (type === 'light') {
    db.ref('/Alerts/lightAlert').set('ACK');
    showTransientNotif('Light alarm acknowledged');
  }
}

// Utility: show center transient notification
function showTransientNotif(text) {
  const n = document.getElementById('notif');
  n.textContent = text;
  n.classList.remove('hidden');
  setTimeout(()=> n.classList.add('hidden'), 4000);
}

// If dashboard page, setup realtime listeners
if (location.pathname.indexOf('dashboard.html') !== -1) {
  auth.onAuthStateChanged(user => {
    if (!user) location.href = 'index.html';
  });

  const tempEl = document.getElementById('temp');
  const humEl = document.getElementById('hum');
  const lightEl = document.getElementById('light');
  const alarmEl = document.getElementById('alarm');
  const logsEl = document.getElementById('logs');
  const lightTimerEl = document.getElementById('lightTimer');

  // Check if elements exist
  if (!tempEl) console.error('temp element not found');
  if (!humEl) console.error('hum element not found');

  // First, let's explore the Firebase structure to find the correct path
  db.ref('/').once('value', snap => {
    const root = snap.val();
    console.log('Firebase root structure:', root);
    if (root) {
      console.log('Root keys:', Object.keys(root));
    }
  });

  // Try multiple possible paths
  const possiblePaths = [
    '/SensorData/temperature',
    '/sensorData/temperature',
    '/Sensors/temperature',
    '/sensors/temperature',
    '/Data/temperature',
    '/data/temperature',
    '/temperature',
    '/sensor_data/temperature'
  ];

  // Test each path to find where the data actually is
  possiblePaths.forEach(path => {
    db.ref(path).once('value', snap => {
      const data = snap.val();
      if (data !== null && data !== undefined) {
        console.log(`✓ Found data at path: ${path}`, data);
      }
    });
  });

  // Live values: read from /sensors (the actual path in Firebase)
  const tempRef = db.ref('/sensors/temperature');
  const humRef  = db.ref('/sensors/humidity');
  const lightRef= db.ref('/sensors/light');

  // Temperature listener - data is stored as direct value at /sensors/temperature
  tempRef.on('value', snap => {
    const val = snap.val();
    console.log('Temperature data received:', val);
    
    if (tempEl) {
      if (val !== null && val !== undefined) {
        tempEl.innerText = 'Temp: ' + val + ' °C';
        console.log('✓ Temperature updated:', val);
      } else {
        tempEl.innerText = 'Temp: -- °C';
      }
    }
  });
  
  // Humidity listener - data is stored as direct value at /sensors/humidity
  humRef.on('value', snap => {
    const val = snap.val();
    console.log('Humidity data received:', val);
    
    if (humEl) {
      if (val !== null && val !== undefined) {
        humEl.innerText = 'Humidity: ' + val + ' %';
        console.log('✓ Humidity updated:', val);
      } else {
        humEl.innerText = 'Humidity: -- %';
      }
    }
  });
  
  // Light listener - data is stored as direct value at /sensors/light
  lightRef.on('value', snap => {
    const val = snap.val();
    console.log('Light data received:', val);
    
    if (lightEl) {
      lightEl.innerText = 'Light: ' + (val || '--');
    }
    
    // start/stop timer if light on
    if (val === 'ON') {
      lightStart = Date.now();
      startLightTimer();
      // show notification after 5s (demo) or 1 minute in real
      setTimeout(()=> {
        showTransientNotif('Light is ON for a while — consider switching off');
        // show browser notification
        if (Notification.permission === "granted") {
          new Notification("Hostel Monitor", { body: "Light ON detected" });
        } else if (Notification) Notification.requestPermission();
      }, 5000); // change to 60000 for 1 minute
    } else {
      stopLightTimer();
    }
  });

  // Listen Alerts
  const alertsRef = db.ref('/Alerts');
  alertsRef.on('value', snap => {
    const a = snap.val() || {};
    alarmEl.innerText = 'Alarm: ' + ((a.temperatureAlert && a.temperatureAlert !== 'NORMAL') ? a.temperatureAlert : (a.lightAlert && a.lightAlert !== 'LIGHT_OFF' ? a.lightAlert : 'NONE'));
    if (a.temperatureAlert === 'HIGH' || a.lightAlert === 'LIGHT_ON') {
      // visual + sound
      alarmEl.style.color = '#ff6b6b';
      playAlarmSound();
    } else {
      alarmEl.style.color = '#bfefff';
    }
  });

  // Logs: Since temperature is a single value, we'll track changes over time
  // Store recent values in an array
  let temperatureHistory = [];
  const maxLogEntries = 30;
  
  const logsRef = db.ref('/sensors/temperature');
  logsRef.on('value', snap => {
    const val = snap.val();
    if (val !== null && val !== undefined) {
      // Add timestamp and value to history
      temperatureHistory.push({
        time: new Date().toLocaleTimeString(),
        value: val
      });
      // Keep only last 30 entries
      if (temperatureHistory.length > maxLogEntries) {
        temperatureHistory.shift();
      }
      
      // Update logs display
      logsEl.innerHTML = '';
      if (temperatureHistory.length === 0) {
        logsEl.innerHTML = '<i>No logs</i>';
      } else {
        // Show as latest first
        temperatureHistory.slice().reverse().forEach(entry => {
          const el = document.createElement('div');
          el.textContent = entry.time + ' - T: ' + entry.value + ' °C';
          logsEl.appendChild(el);
        });
      }
    }
  });

  // light timer helpers
  let lightStart = null;
  let lightTimerId = null;
  function startLightTimer() {
    if (lightTimerId) return;
    lightTimerId = setInterval(()=>{
      const s = Math.floor((Date.now() - lightStart)/1000);
      lightTimerEl.innerText = 'Light ON for: ' + s + 's';
    }, 1000);
  }
  function stopLightTimer() {
    if (lightTimerId) clearInterval(lightTimerId);
    lightTimerId = null;
    lightTimerEl.innerText = 'Light ON for: 0s';
  }

  // play short alarm beep (web audio)
  function playAlarmSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      o.stop(ctx.currentTime + 0.65);
    } catch (e) { /* some browsers restrict auto-play */ }
  }

  // request notification permission
  if (Notification && Notification.permission !== "granted") {
    Notification.requestPermission();
  }
}