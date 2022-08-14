export class AsyncMessager {
    /**
     * 
     * @param {MessagePort} port 
     */
    constructor(port) {
        /**
         * @type {Map<string, (data: any) => void>}
         */
        this._messages = new Map();
        this._id = 0;
        this._onMessage = this._onMessage.bind(this)

        port && this.init(port); 
    }

    get isActive() {
        return !!this.port;
    }

    /**
     * 
     * @param {MessagePort} port 
     */
    init(port) {
        if (this.port) {
            this.port.removeEventListener('message', this._onMessage);
        }

        this.port = port;
        this.port.addEventListener('message', this._onMessage);
        this.port.start();
    }

    /**
     * @private
     * @param {MessageEvent} event 
     */
    _onMessage(event) {
        const { data, type, id, isAnswer } = event.data;

        let resolver = this._messages.get(id);

        if(resolver) {
            // this is promise
            this._messages.delete(id);
        } else {
            // we not should delete it, it permanent
            resolver = this._messages.get(type);
        }

        if (!resolver && !isAnswer) {
            throw new Error('Unknow message:' + type + ' with id:' + id);
        }

        const result = resolver ? resolver(data) : undefined;

        // not fire back anwers
        if (!isAnswer) {
           Promise.resolve(result).then((pr) => {
                this.port.postMessage({ type, data: pr, id, isAnswer: true });
            })
        }
    }

    /**
     * 
     * @param {string} type 
     * @param {*} data 
     * @param {Transferable[]} [transferable]
     * @returns { Promise<any>}
     */
    notify(type, data, transferable) {
        const key = type + this._id;
        const promise = new Promise((res) => {
            this._messages.set(key, res);
        });
        this._id ++;

        this.port.postMessage( { type, data, id: key }, transferable ? transferable : undefined);

        return promise;
    }

    /**
     * 
     * @param {string} type 
     * @param {(data: any) => void} callback 
     */
    onStream(type, callback) {
        this._messages.set(type, callback);
        return this;
    }

    /**
     * 
     * @param {string} type 
     * @param {(data: any) => void} [callback] 
     */
    offStream(type, callback) {
        this._messages.delete(type);
        return this;
    }
}