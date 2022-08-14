declare class AudioWorkletProcessor {
    public readonly port: MessagePort;
    public process(input: Float32Array[][], output: Float32Array[][], params: AudioParamMap): boolean;
}

declare interface AudioWorkletGlobalScope {
    readonly currentFrame: number;
    readonly currentTime: number;
    readonly sampleRate: number;

    registerProcessor(name: string, ctor: any);
}