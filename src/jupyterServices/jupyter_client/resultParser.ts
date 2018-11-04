"use strict";

import { KernelMessage } from '@jupyterlab/services';
import { EventEmitter } from "events";
import * as Rx from 'rx';
import { Helpers } from '../../common/helpers';
import { ParsedIOMessage } from '../../contracts';

export class MessageParser extends EventEmitter {
    constructor() {
        super();
    }

    public processResponse(message: KernelMessage.IIOPubMessage, observer?: Rx.Observer<ParsedIOMessage>) {
        if (!message || !Helpers.isValidMessag(message)) {
            return;
        }

        try {
            const msg_type = message.header.msg_type;
            if (msg_type === 'status') {
                this.emit('status', (message.content as any).execution_state);
            }
            const msg_id = (message.parent_header as any).msg_id;
            if (!msg_id) {
                return;
            }

            const status = (message.content as any).status;
            let parsedMesage: ParsedIOMessage;
            switch (status) {
                case 'abort':
                case 'aborted':
                case 'error': {
                    // http://jupyter-client.readthedocs.io/en/latest/messaging.html#request-reply
                    if (msg_type !== 'complete_reply' && msg_type !== 'inspect_reply') {
                        parsedMesage = {
                            data: 'error',
                            type: 'text',
                            stream: 'status'
                        };
                    }
                    break;
                }
                case 'ok': {
                    // http://jupyter-client.readthedocs.io/en/latest/messaging.html#request-reply
                    if (msg_type !== 'complete_reply' && msg_type !== 'inspect_reply') {
                        parsedMesage = {
                            data: 'ok',
                            type: 'text',
                            stream: 'status'
                        };
                    }
                }
            }

            if (!parsedMesage) {
                parsedMesage = Helpers.parseIOMessage(message);
            }
            if (!parsedMesage || !observer) {
                return;
            }

            observer.onNext(parsedMesage);
        } catch (ex) {
            this.emit('shellmessagepareerror', ex, JSON.stringify(message));
        }
    }
}
