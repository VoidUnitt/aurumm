import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, getDoc, updateDoc, arrayUnion, getDocs, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyA19cg9dvbo_2t59pNmEC5Hm7Ryj9hjQb0",
    authDomain: "aurum-e244a.firebaseapp.com",
    projectId: "aurum-e244a",
    storageBucket: "aurum-e244a.firebasestorage.app",
    messagingSenderId: "403538033504",
    appId: "1:403538033504:web:dde02304b4665f0fe1bc05"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let currentUser = null;
let currentChat = null;
let currentContact = null;
let unsubscribeMessages = null;
let mediaRecorder = null;
let audioChunks = [];
let currentCall = null;
let localStream = null;
let peerConnection = null;
let callTimer = null;
let callStartTime = null;

const authScreen = document.getElementById('authScreen');
const mainScreen = document.getElementById('mainScreen');
const userNameSpan = document.getElementById('userName');
const chatsList = document.getElementById('chatsList');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatNameSpan = document.getElementById('chatName');
const chatAvatar = document.getElementById('chatAvatar');
const authMessage = document.getElementById('authMessage');
const voiceMsgBtn = document.getElementById('voiceMsgBtn');
const voiceRecordingPanel = document.getElementById('voiceRecordingPanel');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');
const audioCallBtn = document.getElementById('audioCallBtn');
const videoCallBtn = document.getElementById('videoCallBtn');
const callModal = document.getElementById('callModal');
const callNameSpan = document.getElementById('callName');
const callStatusSpan = document.getElementById('callStatus');
const callTimerSpan = document.getElementById('callTimer');
const endCallBtn = document.getElementById('endCallBtn');
const ringtone = document.getElementById('callRingtone');
const callEndSound = document.getElementById('callEndSound');

// Переключение табов
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));
        if (tab.dataset.tab === 'login') {
            document.getElementById('loginForm').classList.add('active');
        } else {
            document.getElementById('registerForm').classList.add('active');
        }
        if (authMessage) authMessage.innerHTML = '';
    });
});

// Регистрация
document.getElementById('registerBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('regName')?.value.trim();
    const email = document.getElementById('regEmail')?.value.trim();
    const password = document.getElementById('regPassword')?.value;
    
    if (!name || !email || !password) {
        if (authMessage) authMessage.innerHTML = '<div class="error">❌ Заполните все поля</div>';
        return;
    }
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            name: name,
            email: email,
            contacts: [],
            chats: [],
            createdAt: Date.now()
        });
        if (authMessage) authMessage.innerHTML = '<div class="success">✅ Регистрация успешна! Теперь войдите.</div>';
        document.querySelector('.tab[data-tab="login"]')?.click();
    } catch (error) {
        if (authMessage) authMessage.innerHTML = `<div class="error">❌ ${error.message}</div>`;
    }
});

// Вход
document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    
    if (!email || !password) {
        if (authMessage) authMessage.innerHTML = '<div class="error">❌ Введите email и пароль</div>';
        return;
    }
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (authMessage) authMessage.innerHTML = `<div class="error">❌ ${error.message}</div>`;
    }
});

// Выход
document.getElementById('logoutMainBtn')?.addEventListener('click', async () => {
    await signOut(auth);
});

// Состояние авторизации
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        userNameSpan.textContent = userData?.name || user.displayName;
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl) avatarEl.textContent = (userData?.name || user.displayName)[0];
        
        authScreen.style.display = 'none';
        mainScreen.style.display = 'flex';
        loadChats();
    } else {
        currentUser = null;
        authScreen.style.display = 'flex';
        mainScreen.style.display = 'none';
        if (unsubscribeMessages) unsubscribeMessages();
        if (currentCall) endCall();
    }
});

// Загрузка чатов
async function loadChats() {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const userData = userDoc.data();
    const chatIds = userData?.chats || [];
    
    if (chatIds.length === 0) {
        chatsList.innerHTML = '<div class="empty-state">✨ Нет чатов. Добавьте друга по email!</div>';
        return;
    }
    
    let chatsHtml = '';
    for (const chatId of chatIds) {
        const chatDoc = await getDoc(doc(db, 'chats', chatId));
        if (chatDoc.exists()) {
            const chat = chatDoc.data();
            const otherId = chat.participants.find(id => id !== currentUser.uid);
            const otherUser = await getDoc(doc(db, 'users', otherId));
            const otherData = otherUser.data();
            
            chatsHtml += `
                <div class="chat-item" data-chat-id="${chatId}" data-user-id="${otherId}">
                    <div class="chat-avatar-small">${otherData?.avatar || '👤'}</div>
                    <div class="chat-info">
                        <div class="chat-name-small">${escapeHtml(otherData?.name || 'Пользователь')}</div>
                        <div class="chat-preview">${chat.lastMessage?.substring(0, 30) || 'Новое сообщение'}</div>
                    </div>
                </div>
            `;
        }
    }
    
    chatsList.innerHTML = chatsHtml;
    document.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', () => openChat(el.dataset.chatId, el.dataset.userId));
    });
}

// Открыть чат
async function openChat(chatId, userId) {
    currentChat = chatId;
    currentContact = userId;
    
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userData = userDoc.data();
    chatNameSpan.textContent = userData?.name || 'Пользователь';
    chatAvatar.innerHTML = userData?.avatar || '👤';
    
    if (unsubscribeMessages) unsubscribeMessages();
    
    const messagesQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('time', 'asc'));
    unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
        messagesContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            const isOutgoing = msg.senderId === currentUser.uid;
            if (msg.type === 'text') {
                messagesContainer.innerHTML += `
                    <div class="message message-${isOutgoing ? 'outgoing' : 'incoming'}">
                        <div class="message-text">${escapeHtml(msg.text)}</div>
                        <div class="message-time">${formatTime(msg.time)}</div>
                    </div>
                `;
            } else if (msg.type === 'voice') {
                messagesContainer.innerHTML += `
                    <div class="message message-${isOutgoing ? 'outgoing' : 'incoming'}">
                        <div class="message-audio">
                            <button onclick="playAudio('${msg.audioUrl}')">▶️</button>
                            <span>Голосовое сообщение</span>
                            <span>${msg.duration || '0:05'}</span>
                        </div>
                        <div class="message-time">${formatTime(msg.time)}</div>
                    </div>
                `;
            }
        });
        const container = document.getElementById('messagesContainer');
        container.scrollTop = container.scrollHeight;
    });
}

// Отправить сообщение
sendBtn.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (!text || !currentChat) return;
    
    await addDoc(collection(db, 'chats', currentChat, 'messages'), {
        text: text,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        time: Date.now(),
        type: 'text'
    });
    
    await updateDoc(doc(db, 'chats', currentChat), {
        lastMessage: text,
        lastTime: Date.now()
    });
    
    messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendBtn.click();
});

// Голосовые сообщения
voiceMsgBtn.addEventListener('click', startVoiceRecording);

async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const storageRef = ref(storage, `voice/${currentChat}/${Date.now()}.webm`);
            await uploadBytes(storageRef, audioBlob);
            const audioUrl = await getDownloadURL(storageRef);
            
            await addDoc(collection(db, 'chats', currentChat, 'messages'), {
                audioUrl: audioUrl,
                senderId: currentUser.uid,
                senderName: currentUser.displayName,
                time: Date.now(),
                type: 'voice',
                duration: '0:05'
            });
            
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        voiceRecordingPanel.style.display = 'flex';
        voiceMsgBtn.style.display = 'none';
    } catch (err) {
        alert('Нет доступа к микрофону');
    }
}

stopRecordingBtn.addEventListener('click', () => {
    if (mediaRecorder) {
        mediaRecorder.stop();
        voiceRecordingPanel.style.display = 'none';
        voiceMsgBtn.style.display = 'flex';
    }
});

window.playAudio = (url) => new Audio(url).play();

// Добавление контакта
document.getElementById('addContactBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('newContactEmail').value.trim();
    if (!email) return;
    
    const usersQuery = query(collection(db, 'users'), where('email', '==', email));
    const snapshot = await getDocs(usersQuery);
    
    if (snapshot.empty) {
        alert('Пользователь не найден');
        return;
    }
    
    snapshot.forEach(async (docSnap) => {
        const contactId = docSnap.id;
        if (contactId === currentUser.uid) {
            alert('Это вы сами');
            return;
        }
        
        // Проверяем есть ли уже чат
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        let existingChat = null;
        
        if (userData.chats) {
            for (const chatId of userData.chats) {
                const chatDoc = await getDoc(doc(db, 'chats', chatId));
                if (chatDoc.exists() && chatDoc.data().participants.includes(contactId)) {
                    existingChat = chatId;
                    break;
                }
            }
        }
        
        if (existingChat) {
            alert('Чат уже существует');
            openChat(existingChat, contactId);
        } else {
            const chatId = Date.now().toString();
            await setDoc(doc(db, 'chats', chatId), {
                participants: [currentUser.uid, contactId],
                createdAt: Date.now(),
                lastMessage: '',
                lastTime: null
            });
            
            await updateDoc(doc(db, 'users', currentUser.uid), {
                chats: arrayUnion(chatId)
            });
            await updateDoc(doc(db, 'users', contactId), {
                chats: arrayUnion(chatId)
            });
            
            alert('Контакт добавлен!');
            loadChats();
            openChat(chatId, contactId);
        }
    });
    
    document.getElementById('newContactEmail').value = '';
});

// Звонки
async function startCall(type, isVideo = false) {
    if (!currentContact) {
        alert('Выберите чат');
        return;
    }
    
    const userDoc = await getDoc(doc(db, 'users', currentContact));
    const userData = userDoc.data();
    callNameSpan.textContent = userData?.name || 'Пользователь';
    callStatusSpan.textContent = 'Соединение...';
    callTimerSpan.textContent = '00:00';
    callModal.style.display = 'flex';
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        
        if (isVideo) {
            const localVideo = document.getElementById('localVideo');
            localVideo.style.display = 'block';
            localVideo.srcObject = localStream;
            
            const remoteVideo = document.getElementById('remoteVideo');
            remoteVideo.style.display = 'block';
        }
        
        callStatusSpan.textContent = 'Разговор идёт...';
        callStartTime = Date.now();
        callTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            callTimerSpan.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
        
        ringtone.play();
        setTimeout(() => ringtone.pause(), 3000);
        
    } catch (err) {
        alert('Нет доступа к микрофону/камере');
        endCall();
    }
}

function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (callTimer) clearInterval(callTimer);
    
    callModal.style.display = 'none';
    callEndSound.play();
    
    document.getElementById('localVideo').style.display = 'none';
    document.getElementById('remoteVideo').style.display = 'none';
    if (peerConnection) peerConnection.close();
    peerConnection = null;
}

audioCallBtn?.addEventListener('click', () => startCall('audio', false));
videoCallBtn?.addEventListener('click', () => startCall('video', true));
endCallBtn?.addEventListener('click', endCall);

// Поиск
document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    document.querySelectorAll('.chat-item').forEach(item => {
        const name = item.querySelector('.chat-name-small')?.textContent.toLowerCase();
        if (name?.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
});

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('🚀 Aurum Messenger готов!');
