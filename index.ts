const META_SIZE = 2

type Meta = {
  addr: number
  free: boolean
  size: number
  prev: number | null
  next: number | null
}

type PartialBy<T extends object, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>

class Stack {
  private stack: Uint8Array
  private chunkSize: number

  constructor(size: number, chunkSize: number = 8) {
    this.chunkSize = chunkSize
    this.stack = new Uint8Array(size)
    this.writeMeta({
      addr: 0,
      size: this.stack.length - META_SIZE,
      free: true,
    })
  }

  private ceilSize(val: number): number {
    return Math.ceil(val / this.chunkSize) * this.chunkSize
  }

  private writeMeta(meta: PartialBy<Meta, "next" | "prev">): Meta {
    this.stack[meta.addr] = (meta.size << 1) | Number(meta.free)
    this.stack[meta.addr + 1] = meta.prev ?? 0

    return this.readMeta(meta.addr)
  }

  private readMeta(addr: number): Meta {
    const free = Boolean(this.stack[addr] & 1)
    const size = this.stack[addr] >>> 1
    const prev = this.stack[addr + 1]
    const next = this.ceilSize(addr + size + META_SIZE)

    return {
      addr,
      free,
      size,
      prev: prev < addr && prev >= 0 ? prev : null,
      next: next > addr && next < this.stack.length ? next : null,
    }
  }

  private findFree(size: number, offset = 0): Meta {
    const meta = this.readMeta(offset)

    if (meta.free && meta.size >= size) {
      return meta
    }

    if (meta.next !== null) {
      return this.findFree(size, meta.next)
    }

    throw new Error("No space left on stack")
  }

  allocate(size: number): Meta {
    const self = this.findFree(size)
    self.free = false
    self.size = size

    const limit = self.next ?? this.stack.length
    const next = this.ceilSize(self.addr + size + META_SIZE)

    if (limit - next >= this.chunkSize) {
      this.writeMeta({
        addr: next,
        size: limit - next - META_SIZE,
        free: true,
      })

      self.next = next
    }

    return this.writeMeta(self)
  }

  free(meta: Meta) {
    const a = meta.addr === 0

    meta.free = true
    meta.size = (this.ceilSize(meta.size) || this.chunkSize) - META_SIZE

    a && console.log("expanded", meta)

    if (meta.prev !== null) {
      const prev = this.readMeta(meta.prev)

      if (prev.free) {
        meta.size += meta.addr - prev.addr
        meta.addr = prev.addr
        meta.prev = prev.prev
      }
    }

    if (meta.next !== null) {
      const next = this.readMeta(meta.next)

      if (next.free) {
        meta.size += META_SIZE + next.size

        if (next.next !== null) {
          const nextNext = this.readMeta(next.next)

          nextNext.prev = meta.addr

          this.writeMeta(nextNext)
        }
      } else {
        next.prev = meta.addr

        this.writeMeta(next)
      }
    }

    this.writeMeta(meta)
    this.fill(meta, 0)
  }

  fill(meta: Meta, value: number) {
    for (let i = 0; i < meta.size; i++) {
      let p = i + META_SIZE + meta.addr

      this.stack[p] = value
    }
  }

  write(meta: Meta, value: Uint8Array) {
    const offset = meta.size - value.length
    if (offset < 0) {
      throw new Error("overflow")
    }

    for (let i = 0; i < value.length; i++) {
      this.stack[meta.addr + META_SIZE + offset + i] = value[i]
    }
  }

  read(meta: Meta) {
    return this.stack.slice(
      meta.addr + META_SIZE,
      meta.addr + META_SIZE + meta.size,
    )
  }

  collect() {
    const items: Meta[] = []

    let meta: Meta | null = this.readMeta(0)

    while (meta) {
      items.push(meta)

      meta = meta.next ? this.readMeta(meta.next) : null
    }

    return items
  }

  print(msg?: string) {
    const items = this.collect()
    console.log(msg ?? "Stack items", items.length, items)
  }

  printBytes() {
    console.log(this.stack)
  }
}

function encode(str: string): Uint8Array {
  return new Uint8Array(str.length).map((_, i) => str.charCodeAt(i))
}

function decode(val: Uint8Array): string {
  return String.fromCharCode(...val)
}

const stack = new Stack(64, 8)
stack.print("init")
const a = stack.allocate(1)
stack.print("+a")
const b = stack.allocate(1)
stack.print("+b")
stack.free(a)
stack.print("-a")
const c = stack.allocate(8)
stack.print("+c")
stack.free(b)
stack.print("-b")
const d = stack.allocate(6)
stack.print("+d")
const e = stack.allocate(0)
stack.print("+e")
stack.free(e)
stack.print("-e")
const f = stack.allocate(2)
stack.print("+f")
stack.write(d, encode("hello!"))
stack.printBytes()
console.log(decode(stack.read(d)))
