/// <reference path="./observablevalue" />

namespace mobservable {
    export namespace _ {
        export class ObservableView<T> extends ObservingDNode {
            private isComputing = false;
            private hasError = false;
            protected _value: T;
            protected changeEvent = new SimpleEventEmitter();

            constructor(protected func:()=>T, private scope: Object, context:Mobservable.IContextInfoStruct) {
                super(context);
            }

            get():T {
                if (this.isComputing)
                    throw new Error("Cycle detected");
                if (this.isSleeping) {
                    if (RootDNode.trackingStack.length > 0) {
                        // somebody depends on the outcome of this computation
                        this.wakeUp(); // note: wakeup triggers a compute
                        this.notifyObserved();
                    } else {
                        // nobody depends on this computable; so compute a fresh value but do not wake up
                        this.compute();
                    }
                } else {
                    // we are already up to date, somebody is just inspecting our current value
                    this.notifyObserved();
                }

                if (this.hasCycle)
                    throw new Error("Cycle detected");
                if (this.hasError) {
                    if (debugLevel) {
                        console.trace();
                        warn(`${this}: rethrowing caught exception to observer: ${this._value}${(<any>this._value).cause||''}`);
                    }
                    throw this._value;
                }
                return this._value;
            }

            set() {
                throwingSetter();
            }

            compute() {
                var newValue:T;
                try {
                    // this cycle detection mechanism is primarily for lazy computed values; other cycles are already detected in the dependency tree
                    if (this.isComputing)
                        throw new Error("Cycle detected");
                    this.isComputing = true;
                    newValue = this.func.call(this.scope);
                    this.hasError = false;
                } catch (e) {
                    this.hasError = true;
                    console.error(this + "Caught error during computation: ", e);
                    if (e instanceof Error)
                        newValue = e;
                    else {
                        newValue = <T><any> new Error("MobservableComputationError");
                        (<any>newValue).cause = e;
                    }
                }
                this.isComputing = false;
                if (newValue !== this._value) {
                    var oldValue = this._value;
                    this._value = newValue;
                    this.changeEvent.emit(newValue, oldValue);
                    return true;
                }
                return false;
            }

            observe(listener:(newValue:T, oldValue:T)=>void, fireImmediately=false):Lambda {
                this.setRefCount(+1); // awake
                if (fireImmediately)
                    listener(this.get(), undefined);
                var disposer = this.changeEvent.on(listener);
                return once(() => {
                    this.setRefCount(-1);
                    disposer();
                });
            }

            asPropertyDescriptor(): PropertyDescriptor {
                return {
                    configurable: false,
                    enumerable: false,
                    get: () => this.get(),
                    set: throwingSetter
                }
            }

            toString() {
                return `ComputedObservable[${this.context.name}:${this._value}]`;
            }
        }

        function throwingSetter() {
            throw new Error("View functions do not accept new values");
        }
    }
}