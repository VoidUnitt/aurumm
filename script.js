import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, getDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let currentUser = null;
let currentChat = null;
let unsubscribeMessages = null;

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
        document.getElementById('regName').value = '';
        document.getElementById('regEmail').value = '';
        document.getElementById('regPassword').value = '';
        document.querySelector('.tab[data-tab="login"]')?.click();
    } catch (error) {
        if (authMessage) authMessage.innerHTML = `<div class="error">❌ ${error.message}</div>`;
    }
});

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

document.getElementById('logoutMainBtn')?.addEventListener('click', async () => {
    await signOut(auth);
});

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
    }
});

async function loadChats() {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const userData = userDoc.data();
    const chatIds = userData?.chats || [];
    
    if (chatIds.length === 0) {
        chatsList.innerHTML = '<div class="empty-state">✨ Нет чатов. Начните общение!</div>';
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

async function openChat(chatId, userId) {
    currentChat = chatId;
    
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
            messagesContainer.innerHTML += `
                <div class="message message-${isOutgoing ? 'outgoing' : 'incoming'}">
                    <div class="message-text">${escapeHtml(msg.text)}</div>
                    <div class="message-time">${formatTime(msg.time)}</div>
                </div>
            `;
        });
        const container = document.getElementById('messagesContainer');
        container.scrollTop = container.scrollHeight;
    });
}

sendBtn.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (!text || !currentChat) return;
    
    await addDoc(collection(db, 'chats', currentChat, 'messages'), {
        text: text,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        time: Date.now()
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

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

setTimeout(() => {
    if (!document.querySelector('.demo-chat-btn')) {
        const demoBtn = document.createElement('button');
        demoBtn.textContent = '+ Новый чат';
        demoBtn.style.cssText = 'margin:16px;padding:12px;background:#4a9eff;border:none;border-radius:12px;color:white;font-weight:bold;cursor:pointer;';
        demoBtn.onclick = createDemoChat;
        const searchBox = document.querySelector('.search-box');
        if (searchBox) searchBox.after(demoBtn);
    }
}, 1000);

async function createDemoChat() {
    const demoUserId = 'demo_' + Date.now();
    const demoChatId = Date.now().toString();
    
    await setDoc(doc(db, 'users', demoUserId), {
        uid: demoUserId,
        name: 'Демо друг',
        avatar: '👋',
        createdAt: Date.now()
    });
    
    await setDoc(doc(db, 'chats', demoChatId), {
        participants: [currentUser.uid, demoUserId],
        createdAt: Date.now(),
        lastMessage: '',
        lastTime: null
    });
    
    await updateDoc(doc(db, 'users', currentUser.uid), {
        chats: arrayUnion(demoChatId)
    });
    
    loadChats();
    alert('✅ Создан демо-чат!');
}
