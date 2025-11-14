export class Stream<T extends {type: string}> {
    private readonly items: T[] = []
    private pointer: number = 0
    private readonly offset: number
    public readonly length: number

    constructor(source: T[], offset: number = 0) {
        this.length = source.length - offset
        this.offset = offset
        this.items = source
        this.pointer = offset
    }

    public get position() {
        return this.pointer - this.offset
    }
    
    public get hasMore(): boolean {
        return this.pointer < this.items.length
    }

    backtrack(count: number = 1) {
        if (this.pointer - count < this.offset) {
            throw new Error("Cannot backtrack beyond the start of the stream")
        }
        return this.pointer -= count
    }

    range() {
        return new Stream(this.items, this.pointer)
    }

    peek(at: number = 0): T | undefined {
        if (this.pointer + at >= this.items.length) {
            return undefined
        }
        if (this.pointer + at < this.offset) {
            return undefined
        }
        return this.items[this.pointer + at]
    }




    public next(): T | undefined {
        if (this.pointer >= this.items.length) {
            return undefined
        }
        return this.items[this.pointer++]
    }

    consumeWhile(predicate: (item: T, self: Stream<T>) => boolean): T[] {
        const result: T[] = []
        while (this.pointer < this.items.length && predicate(this.items[this.pointer], this)) {
            result.push(this.items[this.pointer])
            this.pointer++
        }
        return result
    }

    consume(index) {
        if (index < 0) {
            throw new Error("Can only advance by a positive index")
        }
        const items = this.items.slice(this.pointer, this.pointer + index)
        this.pointer += index
        return items
    }

    match(...types: string[]): boolean {
        for (let i = 0; i < types.length; i++) {
            const item = this.peek(i)
            if (item?.type !== types[i]) return false
        }
        return true
    }
}

export const EOF = Symbol("EOF")
export type EOF = typeof EOF