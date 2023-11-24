use anyhow::{anyhow, Result};

const META_SIZE: usize = 2;

#[derive(Debug)]
struct Meta {
    addr: usize,
    free: bool,
    size: usize,
    prev: Option<usize>,
    next: Option<usize>,
}

struct Stack {
    stack: Vec<u8>,
    chunk_size: usize,
}

impl Stack {
    fn new(size: usize) -> Stack {
        let mut stack = Stack {
            stack: vec![0; size],
            chunk_size: 8,
        };

        stack
            .write_meta(&Meta {
                addr: 0,
                free: true,
                prev: None,
                next: None,
                size: size - META_SIZE,
            })
            .expect("Failed writing stack init");

        stack
    }

    fn ceil(&self, size: usize) -> usize {
        (size as f64 / self.chunk_size as f64).ceil() as usize * self.chunk_size
    }

    fn read_meta(&self, addr: usize) -> Result<Meta> {
        let first = self.stack[addr];
        let free = first & 1 == 1;
        let size = (first >> 1) as usize;

        let prev = self.stack[addr + 1] as usize;
        let prev = if prev < addr { Some(prev) } else { None };

        let next = self.ceil(addr + META_SIZE + size as usize);
        let next = if addr < next && next < self.stack.len() {
            Some(next)
        } else {
            None
        };

        Ok(Meta {
            addr,
            free,
            size,
            prev,
            next,
        })
    }

    fn write_meta(&mut self, meta: &Meta) -> Result<()> {
        self.stack[meta.addr] = (meta.size as u8) << 1 | meta.free as u8;
        self.stack[meta.addr + 1] = meta.prev.unwrap_or(0) as u8;

        Ok(())
    }

    fn find_free(&self, size: usize, addr: usize) -> Result<Meta> {
        let meta = self.read_meta(addr)?;

        if meta.free && size <= meta.size {
            return Ok(meta);
        }

        if let Some(next) = meta.next {
            return self.find_free(size, next);
        }

        Err(anyhow!("Not enough room in stack"))
    }

    fn allocate(&mut self, size: usize) -> Result<Meta> {
        let mut meta = self.find_free(size, 0)?;

        meta.free = false;
        meta.size = size;

        let limit = meta.next.unwrap_or(self.stack.len());
        let next_addr = self.ceil(meta.addr + META_SIZE + meta.size);

        if limit - next_addr >= self.chunk_size {
            self.write_meta(&Meta {
                addr: next_addr,
                free: true,
                size: limit - next_addr - META_SIZE,
                prev: Some(meta.addr),
                next: meta.next.take(),
            })?;

            meta.next = Some(next_addr);
        }

        self.write_meta(&meta)?;

        Ok(meta)
    }

    fn free(&mut self, mut meta: Meta) -> Result<Meta> {
        meta.free = true;
        meta.size = self.ceil(meta.size) - META_SIZE;

        if let Some(prev) = meta.prev {
            let prev = self.read_meta(prev)?;

            if prev.free {
                meta.size += meta.addr - prev.addr;
                meta.addr = prev.addr;
                meta.prev = prev.prev;
            }
        }

        if let Some(next) = meta.next {
            let mut next = self.read_meta(next)?;

            if next.free {
                meta.size += META_SIZE + next.size;

                if let Some(next) = next.next {
                    let mut next = self.read_meta(next)?;

                    next.prev = Some(meta.addr);

                    self.write_meta(&next)?;
                }
            } else {
                next.prev = Some(meta.addr);

                self.write_meta(&next)?;
            }
        }

        self.write_meta(&meta)?;

        Ok(meta)
    }

    fn collect(&self) -> Result<Vec<Meta>> {
        let mut meta = self.read_meta(0)?;
        let mut next = meta.next;
        let mut res = vec![meta];

        while let Some(addr) = next {
            meta = self.read_meta(addr)?;
            next = meta.next;
            res.push(meta);
        }

        Ok(res)
    }

    fn print(&self, msg: &str) -> Result<()> {
        let metas = self.collect()?;

        for meta in metas {
            println!("{}: {:?}", msg, meta);
        }

        Ok(())
    }
}

fn main() -> Result<()> {
    let mut stack = Stack::new(64);

    stack.print("init")?;
    let a = stack.allocate(12)?;
    stack.print("+a")?;
    let b = stack.allocate(6)?;
    stack.print("+b")?;
    stack.free(a)?;
    stack.print("-a")?;
    stack.free(b)?;
    stack.print("-b")?;

    Ok(())
}
