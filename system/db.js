const DB_NAME = 'AcademicSimulationsDB';
const DB_VERSION = 2;
const STORE_NAME = 'simulations';
const BLOCKS_STORE_NAME = 'custom_blocks';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(BLOCKS_STORE_NAME)) {
                db.createObjectStore(BLOCKS_STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

const dbService = {
    async saveSimulation(id, name, course, state) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const data = {
                id,
                name,
                course,
                timestamp: Date.now(),
                state
            };
            const request = store.put(data);
            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    },

    async getSimulations() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                // Sort by timestamp descending
                const sorted = (request.result || []).sort((a, b) => b.timestamp - a.timestamp);
                resolve(sorted);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async deleteSimulation(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async renameSimulation(id, newName) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const data = getReq.result;
                if (!data) return reject(new Error('Simulation not found'));
                data.name = newName;
                const putReq = store.put(data);
                putReq.onsuccess = () => resolve(data);
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    },

    async saveCustomBlock(block) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(BLOCKS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(BLOCKS_STORE_NAME);
            const request = store.put(block);
            request.onsuccess = () => resolve(block);
            request.onerror = () => reject(request.error);
        });
    },

    async getCustomBlocks() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(BLOCKS_STORE_NAME, 'readonly');
            const store = transaction.objectStore(BLOCKS_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    async deleteCustomBlock(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(BLOCKS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(BLOCKS_STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

window.dbService = dbService;
