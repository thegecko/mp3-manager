export class MockFileHandle {
    kind = 'file';

    constructor(name, data = new Uint8Array()) {
        this.name = name;
        this.data = data;
    }

    async getFile() {
        return new File([this.data.slice()], this.name);
    }

    async createWritable() {
        const chunks = [];

        return {
            write: async data => {
                chunks.push(await toBytes(data));
            },
            close: async () => {
                const next = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
                let offset = 0;
                for (const chunk of chunks) {
                    next.set(chunk, offset);
                    offset += chunk.byteLength;
                }
                this.data = next;
            }
        };
    }
}

export class MockDirectoryHandle {
    kind = 'directory';
    entriesMap = new Map();

    constructor(name) {
        this.name = name;
    }

    addDirectory(name) {
        const directory = new MockDirectoryHandle(name);
        this.entriesMap.set(name, directory);
        return directory;
    }

    addFile(name, data = new Uint8Array()) {
        const file = new MockFileHandle(name, data instanceof Uint8Array ? data : new Uint8Array(data));
        this.entriesMap.set(name, file);
        return file;
    }

    async getDirectoryHandle(name, options) {
        const entry = this.entriesMap.get(name);
        if (entry instanceof MockDirectoryHandle) {
            return entry;
        }
        if (options?.create) {
            return this.addDirectory(name);
        }
        throw new DOMException(`Directory not found: ${name}`, 'NotFoundError');
    }

    async getFileHandle(name, options) {
        const entry = this.entriesMap.get(name);
        if (entry instanceof MockFileHandle) {
            return entry;
        }
        if (options?.create) {
            return this.addFile(name);
        }
        throw new DOMException(`File not found: ${name}`, 'NotFoundError');
    }

    async removeEntry(name) {
        if (!this.entriesMap.delete(name)) {
            throw new DOMException(`Entry not found: ${name}`, 'NotFoundError');
        }
    }

    async *entries() {
        yield* this.entriesMap.entries();
    }
}

const toBytes = async data => {
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (data instanceof Blob) {
        return new Uint8Array(await data.arrayBuffer());
    }
    return new TextEncoder().encode(data.toString());
};
