use crate::{
    catalog::Entry,
    codec::{Command, CommonEvents, Definition},
    Result,
};

const SELF: i32 = 1_600_000;
const LOCK_SLOTS: i32 = 1009;
const LOCKS_PER_EVENT: i32 = 5;
const LOCK_FORMAT: i32 = 2;
const GREATER_THAN: i32 = 0;
const NOT_EQUAL: i32 = 5;
fn common(id: i32, slot: i32) -> i32 {
    15_000_000 + id * 100 + slot
}

#[derive(Default)]
struct Code {
    commands: Vec<Command>,
    depth: u8,
}
impl Code {
    fn emit(&mut self, code: u32, args: &[i32], texts: &[&str]) {
        self.commands
            .push(Command::new(code, args, texts, self.depth));
    }
    fn number(&mut self, target: i32, a: i32, b: i32, flags: i32) {
        self.emit(121, &[target, a, b, flags], &[]);
    }
    fn text(&mut self, target: i32, text: &str, append: bool) {
        self.emit(122, &[target, if append { 256 } else { 0 }], &[text]);
    }
    fn copy(&mut self, target: i32, source: i32) {
        self.emit(122, &[target, 1, source], &[]);
    }
    fn file(&mut self, target: i32, name: &str, write: bool) {
        self.emit(122, &[target, if write { 1536 } else { 1280 }], &[name]);
    }
    fn line(&mut self, source: i32, target: i32) {
        self.emit(122, &[target, 769, source], &[]);
    }
    fn label(&mut self, label: &str) {
        self.emit(212, &[], &[label]);
    }
    fn jump(&mut self, label: &str) {
        self.emit(213, &[], &[label]);
    }
    fn test(&mut self, left: i32, op: i32, right: i32) {
        self.emit(111, &[17, left, right, op], &[]);
        self.emit(401, &[1], &[]);
        self.depth += 1;
    }
    fn other(&mut self) {
        self.emit(0, &[], &[]);
        self.depth -= 1;
        self.emit(420, &[0], &[]);
        self.depth += 1;
    }
    fn end(&mut self) {
        self.emit(0, &[], &[]);
        self.depth -= 1;
        self.emit(499, &[], &[]);
    }
    fn empty(&mut self, variable: i32) {
        self.emit(112, &[1, variable], &["", "", "", ""]);
        self.emit(401, &[1], &[]);
        self.depth += 1;
    }
    fn route(&mut self, route: u8) {
        let mut command = Command::new(201, &[-2], &[], self.depth);
        command.route = vec![3, 3, 3, 0, 3, 2, 1, 0, 0, 0, route, 0, 1, 0];
        self.commands.push(command);
    }
}

pub fn compile(original: &CommonEvents, entries: &[Entry]) -> Result<Vec<u8>> {
    let ranges = ranges(entries)?;
    let root_id = original.events.len() as i32;
    let lookup_id = root_id + 1;
    let locks_id = root_id + 2;
    let workers_base = root_id + 3;
    let workers = (LOCK_SLOTS + LOCKS_PER_EVENT - 1) / LOCKS_PER_EVENT;
    if root_id + 4 + workers > 10_000 {
        return Err("WOLF: nombre de common events insuffisant.".into());
    }
    let root = common(root_id, 0);
    let mut lookup = Code::default();
    dispatch(&mut lookup, &ranges, root);
    let mut find_lock = Code::default();
    lock_lookup(&mut find_lock, root, workers_base);
    let mut io = Code::default();
    io.test(SELF + 98, NOT_EQUAL, LOCK_FORMAT);
    for slot in 0..LOCK_SLOTS {
        io.number(
            common(
                workers_base + slot / LOCKS_PER_EVENT,
                10 + slot % LOCKS_PER_EVENT * 4,
            ),
            0,
            0,
            0,
        );
    }
    for worker in 0..workers {
        io.number(common(workers_base + worker, 99), 0, 0, 0);
    }
    io.number(SELF + 54, 0, 0, 0);
    io.number(SELF + 98, LOCK_FORMAT, 0, 0);
    io.end();
    io.number(SELF + 44, entries.len() as i32, 0, 4);
    io.label("poll");
    io.emit(180, &[3], &[]);
    io.file(SELF + 8, "Data/RPGMToolkit/request.txt", false);
    io.number(SELF + 2, SELF + 8, 0, 0);
    io.test(SELF + 2, 3, 0);
    io.jump("poll");
    io.end();
    io.test(SELF + 2, 2, SELF + 50);
    io.jump("poll");
    io.end();
    io.number(SELF + 50, SELF + 2, 0, 0);
    io.file(SELF + 7, "Data/RPGMToolkit/commands.txt", false);
    io.text(SELF + 5, "{\"request\":\\cself[2],\"results\":[", false);
    io.number(SELF + 51, 0, 0, 0);
    io.number(SELF + 71, 0, 0, 0);
    io.label("next");
    io.empty(SELF + 7);
    io.jump("reply");
    io.end();
    io.test(SELF + 51, 1, 128);
    io.jump("reply");
    io.end();
    for (destination, slot) in [(0, 8), (1, 8), (10, 8)] {
        io.line(SELF + 7, SELF + slot);
        io.number(SELF + destination, SELF + slot, 0, 0);
    }
    io.number(SELF + 22, 1, 0, 0);
    io.number(SELF + 21, 0, 0, 0);
    io.number(SELF + 20, 0, 0, 0);
    io.number(SELF + 23, 0, 0, 0);
    io.test(SELF, 2, -1);
    io.test(SELF + 1, 2, 0);
    io.number(SELF + 22, 0, 0, 0);
    io.number(SELF + 20, SELF + 70, 0, 0);
    io.end();
    io.test(SELF + 1, 2, 5);
    io.test(SELF + 10, 1, 0);
    io.test(SELF + 10, 3, 1);
    io.test(SELF + 10, 2, 1);
    io.route(0x26);
    io.other();
    io.route(0x27);
    io.end();
    io.number(SELF + 70, SELF + 10, 0, 0);
    io.number(SELF + 20, SELF + 70, 0, 0);
    io.number(SELF + 22, 0, 0, 0);
    io.end();
    io.end();
    io.end();
    io.test(SELF + 1, 2, 6);
    io.text(
        SELF + 8,
        "Data/RPGMToolkit/toolkit-save-\\cself[2].sav",
        false,
    );
    io.emit(220, &[0, SELF + 8], &[]);
    io.emit(180, &[1], &[]);
    io.number(SELF + 22, 0, 0, 0);
    io.end();
    io.test(SELF + 1, 2, 7);
    io.number(SELF + 20, SELF + 80, 0, 0);
    io.number(SELF + 22, 0, 0, 0);
    io.end();
    io.test(SELF + 1, 2, 8);
    io.test(SELF + 80, 2, 0);
    io.text(SELF + 8, "Data/RPGMToolkit/input-\\cself[51].txt", false);
    io.emit(122, &[SELF + 6, 1281, SELF + 8], &[]);
    io.text(SELF + 9, "Data/RPGMToolkit/\\cself[6]", false);
    io.number(SELF + 71, 1, 0, 0);
    io.number(SELF + 22, 0, 0, 0);
    io.end();
    io.end();
    io.test(SELF + 1, 2, 9);
    io.test(SELF + 80, 2, 1);
    io.number(SELF + 80, 0, 0, 0);
    io.end();
    io.number(SELF + 20, SELF + 80, 0, 0);
    io.number(SELF + 22, 0, 0, 0);
    io.end();
    io.end();
    io.test(SELF, 1, 0);
    io.test(SELF, 4, SELF + 44);
    io.test(SELF + 1, 1, 0);
    io.test(SELF + 1, 3, 4);
    io.test(SELF + 1, 2, 2);
    io.text(SELF + 8, "Data/RPGMToolkit/input-\\cself[51].txt", false);
    io.emit(122, &[SELF + 6, 1281, SELF + 8], &[]);
    io.end();
    io.number(SELF + 45, SELF, 0, 0);
    io.emit(210, &[500_000 + lookup_id, 0], &[]);
    io.emit(210, &[500_000 + locks_id, 0], &[]);
    io.number(SELF + 22, 0, 0, 0);
    io.test(SELF + 21, 2, 1);
    io.emit(122, &[SELF + 9, 2, SELF + 40], &[]);
    io.other();
    io.number(SELF + 20, SELF + 40, 0, 32);
    io.end();
    io.test(SELF + 1, 2, 1);
    io.test(SELF + 21, 2, 0);
    io.number(SELF + 40, SELF + 10, 0, 16);
    io.test(SELF + 23, 2, 1);
    io.number(SELF + 32, SELF + 10, 0, 16);
    io.end();
    io.number(SELF + 20, SELF + 10, 0, 0);
    io.other();
    io.number(SELF + 22, 1, 0, 0);
    io.end();
    io.end();
    io.test(SELF + 1, 2, 2);
    io.test(SELF + 21, 2, 1);
    io.emit(122, &[SELF + 40, 17, SELF + 6], &[]);
    io.test(SELF + 23, 2, 1);
    io.emit(122, &[SELF + 36, 17, SELF + 6], &[]);
    io.end();
    io.copy(SELF + 9, SELF + 6);
    io.other();
    io.number(SELF + 22, 1, 0, 0);
    io.end();
    io.end();
    io.test(SELF + 1, 2, 3);
    io.test(SELF + 23, 2, 0);
    io.test(SELF + 54, 4, 500);
    io.test(SELF + 48, 1, 0);
    io.test(SELF + 21, 2, 1);
    io.emit(122, &[SELF + 36, 17, SELF + 9], &[]);
    io.other();
    io.number(SELF + 32, SELF + 20, 0, 16);
    io.end();
    io.number(SELF + 31, SELF + 46, 0, 16);
    io.number(SELF + 35, SELF + 40, 0, 16);
    io.number(SELF + 34, SELF + 21, 0, 16);
    io.number(SELF + 33, 1, 0, 272);
    io.number(SELF + 54, 1, 0, 256);
    io.number(SELF + 23, 1, 0, 0);
    io.other();
    io.number(SELF + 22, 3, 0, 0);
    io.end();
    io.other();
    io.number(SELF + 22, 3, 0, 0);
    io.end();
    io.end();
    io.end();
    io.test(SELF + 1, 2, 4);
    io.test(SELF + 23, 2, 1);
    io.number(SELF + 31, -1, 0, 16);
    io.number(SELF + 33, 1, 0, 528);
    io.number(SELF + 54, 1, 0, 512);
    io.number(SELF + 23, 0, 0, 0);
    io.end();
    io.end();
    io.test(SELF + 21, 2, 1);
    io.copy(SELF + 6, SELF + 9);
    io.end();
    io.end();
    io.end();
    io.end();
    io.end();
    io.test(SELF + 51, 0, 0);
    io.text(SELF + 5, ",", true);
    io.end();
    io.text(
        SELF + 5,
        "{\"index\":\\cself[0],\"error\":\\cself[22],\"frozen\":\\cself[23],\"value\":",
        true,
    );
    io.test(SELF + 21, 2, 1);
    io.text(SELF + 8, "Data/RPGMToolkit/output-\\cself[51].txt", false);
    io.emit(122, &[SELF + 6, 1537, SELF + 8], &[]);
    io.text(SELF + 5, "null,\"string\":true", true);
    io.other();
    io.text(SELF + 5, "\\cself[20]", true);
    io.end();
    io.text(SELF + 5, "}", true);
    io.number(SELF + 51, 1, 0, 256);
    io.number(SELF + 52, SELF + 51, 16, 16384);
    io.test(SELF + 52, 2, 0);
    io.emit(180, &[1], &[]);
    io.end();
    io.jump("next");
    io.label("reply");
    io.emit(124, &[SELF + 60, 12288, 0], &[]);
    io.number(SELF + 61, 9_180_000, 0, 0);
    io.number(SELF + 62, 9_180_001, 0, 0);
    io.number(SELF + 63, 9_180_006, 0, 0);
    io.text(SELF+5,"],\"position\":{\"mapId\":\\cself[60],\"x\":\\cself[61],\"y\":\\cself[62],\"direction\":\\cself[63]},\"noclip\":\\cself[70],\"locks\":\\cself[54]}",true);
    io.file(SELF + 5, "Data/RPGMToolkit/reply.txt", true);
    io.number(SELF + 50, SELF + 2, 0, 0);
    io.text(SELF + 8, "\\cself[2]", false);
    io.file(SELF + 8, "Data/RPGMToolkit/ack.txt", true);
    io.test(SELF + 71, 2, 1);
    io.number(SELF + 80, 1, 0, 0);
    io.end();
    io.jump("poll");
    let mut events = vec![
        Definition {
            name: format!("[WOLF Toolkit {}] Bridge", crate::VERSION),
            run: 0x23,
            condition: 2_000_000,
            threshold: 0,
            commands: io.commands,
        },
        Definition {
            name: "[WOLF Toolkit] Dispatch".into(),
            run: 0x20,
            condition: 2_000_000,
            threshold: 0,
            commands: lookup.commands,
        },
        Definition {
            name: "[WOLF Toolkit] Find lock".into(),
            run: 0x20,
            condition: 2_000_000,
            threshold: 0,
            commands: find_lock.commands,
        },
    ];
    for worker in 0..workers {
        let id = workers_base + worker;
        let counter = common(id, 99);
        let mut code = Code::default();
        code.label("freeze");
        code.test(root + 98, 2, LOCK_FORMAT);
        for slot in 0..LOCKS_PER_EVENT {
            if worker * LOCKS_PER_EVENT + slot >= LOCK_SLOTS {
                break;
            }
            let key = common(id, 10 + slot * 4);
            code.test(key, GREATER_THAN, 0);
            code.test(key + 3, 2, 1);
            code.emit(122, &[key + 2, 17, common(id, 5 + slot)], &[]);
            code.other();
            code.number(key + 2, key + 1, 0, 16);
            code.end();
            code.end();
        }
        code.end();
        code.emit(180, &[1], &[]);
        code.jump("freeze");
        events.push(Definition {
            name: format!("[WOLF Toolkit] Locks {worker}"),
            run: 0x12,
            condition: counter as u32,
            threshold: 1,
            commands: code.commands,
        });
    }
    let mut load = Code::default();
    load.number(root + 80, 2, 0, 0);
    load.copy(SELF + 8, root + 9);
    load.emit(180, &[12], &[]);
    load.emit(220, &[1, SELF + 8], &[]);
    events.push(Definition {
        name: "[WOLF Toolkit] Load save".into(),
        run: 0x21,
        condition: (root + 80) as u32,
        threshold: 1,
        commands: load.commands,
    });
    original.append_events(&events)
}

struct Range {
    start: usize,
    base: i32,
    matrix: bool,
    strings: Vec<bool>,
}

fn ranges(entries: &[Entry]) -> Result<Vec<Range>> {
    if entries.is_empty() {
        return Err("WOLF: aucun champ éditable dans ce jeu.".into());
    }
    if entries.len() > crate::catalog::MAX_ENTRIES {
        return Err("WOLF: dimensions du catalogue invalides.".into());
    }
    let mut out = Vec::new();
    let mut start = 0;
    while start < entries.len() {
        let entry = &entries[start];
        let base = entry.reference;
        if (1_100_000_000..1_200_000_000).contains(&base) && base % 1_000_000 == 0 {
            let length = entries[start..]
                .iter()
                .take_while(|e| e.reference / 1_000_000 == base / 1_000_000)
                .count();
            let columns = entries[start..start + length]
                .iter()
                .take_while(|e| e.reference - base < 100)
                .count();
            if columns == 0 || columns > 100 || length % columns != 0 || length / columns > 10_000 {
                return Err("WOLF: dimensions du catalogue invalides.".into());
            }
            let strings: Vec<bool> = entries[start..start + columns]
                .iter()
                .map(|e| e.string)
                .collect();
            for (i, e) in entries[start..start + length].iter().enumerate() {
                if e.reference != base + (i / columns) as i32 * 100 + (i % columns) as i32
                    || e.string != strings[i % columns]
                {
                    return Err("WOLF: adresses du catalogue invalides.".into());
                }
            }
            out.push(Range {
                start,
                base,
                matrix: true,
                strings,
            });
            start += length;
        } else if (2_000_000..3_010_000).contains(&base) {
            let length = entries[start..]
                .iter()
                .enumerate()
                .take_while(|(i, e)| e.reference == base + *i as i32 && e.string == entry.string)
                .count();
            out.push(Range {
                start,
                base,
                matrix: false,
                strings: vec![entry.string],
            });
            start += length;
        } else {
            return Err("WOLF: adresse du catalogue non prise en charge.".into());
        }
    }
    Ok(out)
}

fn dispatch(code: &mut Code, ranges: &[Range], root: i32) {
    if ranges.len() > 1 {
        let mid = ranges.len() / 2;
        code.number(root + 42, ranges[mid].start as i32, 0, 4);
        code.test(root + 45, 4, root + 42);
        dispatch(code, &ranges[..mid], root);
        code.other();
        dispatch(code, &ranges[mid..], root);
        code.end();
        return;
    }
    let range = &ranges[0];
    code.number(root + 41, range.start as i32, 0, 4);
    code.number(root + 41, root + 45, root + 41, 4096);
    if range.matrix {
        code.number(root + 42, root + 41, range.strings.len() as i32, 12288);
        code.number(root + 42, root + 42, 100, 8192);
        code.number(root + 43, root + 41, range.strings.len() as i32, 16384);
        code.number(root + 41, root + 42, root + 43, 0);
    }
    code.number(root + 40, range.base, 0, 4);
    code.number(root + 40, root + 41, 0, 256);
    field_type(code, &range.strings, root, 0);
}

fn field_type(code: &mut Code, fields: &[bool], root: i32, start: usize) {
    if fields.iter().all(|field| *field == fields[0]) {
        code.number(root + 21, i32::from(fields[0]), 0, 0);
    } else {
        let mid = fields.len() / 2;
        code.test(root + 43, 4, (start + mid) as i32);
        field_type(code, &fields[..mid], root, start);
        code.other();
        field_type(code, &fields[mid..], root, start + mid);
        code.end();
    }
}

fn lock_addresses(code: &mut Code, root: i32, base: i32) {
    code.number(root + 38, root + 47, LOCKS_PER_EVENT, 12288);
    code.number(root + 38, root + 38, 100, 8192);
    code.number(root + 39, root + 47, LOCKS_PER_EVENT, 16384);
    code.number(root + 37, root + 39, 4, 8192);
    code.number(root + 31, common(base, 10), 0, 4);
    code.number(root + 31, root + 38, root + 37, 256);
    for (slot, offset) in [(32, 1), (35, 2), (34, 3)] {
        code.number(root + slot, root + 31, offset, 0);
    }
    code.number(root + 36, common(base, 5), 0, 4);
    code.number(root + 36, root + 38, root + 39, 256);
    code.number(root + 33, common(base, 99), 0, 4);
    code.number(root + 33, root + 38, 0, 256);
}

fn lock_lookup(code: &mut Code, root: i32, base: i32) {
    code.number(root + 46, root, 1, 0);
    code.number(root + 47, root, LOCK_SLOTS, 16384);
    code.number(root + 48, -1, 0, 0);
    code.number(root + 49, 0, 0, 0);
    code.label("find");
    lock_addresses(code, root, base);
    code.number(root + 23, root + 31, 0, 32);
    code.test(root + 23, 2, root + 46);
    code.number(root + 23, 1, 0, 0);
    code.jump("found");
    code.end();
    code.test(root + 23, 3, 0);
    code.test(root + 48, 2, -1);
    code.number(root + 48, root + 47, 0, 0);
    code.end();
    code.test(root + 23, 2, 0);
    code.jump("available");
    code.end();
    code.end();
    code.number(root + 49, 1, 0, 256);
    code.test(root + 49, 1, LOCK_SLOTS);
    code.jump("available");
    code.end();
    code.number(root + 47, 1, 0, 256);
    code.number(root + 47, root + 47, LOCK_SLOTS, 16384);
    code.jump("find");
    code.label("available");
    code.test(root + 48, 1, 0);
    code.number(root + 47, root + 48, 0, 0);
    lock_addresses(code, root, base);
    code.end();
    code.number(root + 23, 0, 0, 0);
    code.label("found");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn execute(commands: &[Command], context: i32, memory: &mut HashMap<i32, i32>) {
        fn address(reference: i32, context: i32) -> i32 {
            if (SELF..SELF + 100).contains(&reference) {
                context + reference - SELF
            } else {
                reference
            }
        }
        fn value(memory: &HashMap<i32, i32>, reference: i32, context: i32) -> i32 {
            if reference >= 1_000_000 {
                *memory.get(&address(reference, context)).unwrap_or(&0)
            } else {
                reference
            }
        }
        let mut pc = 0;
        while pc < commands.len() {
            let command = &commands[pc];
            match command.code {
                121 => {
                    let flags = command.args[3];
                    let a = if flags & 4 != 0 {
                        command.args[1]
                    } else {
                        value(memory, command.args[1], context)
                    };
                    let b = value(memory, command.args[2], context);
                    let result = match flags & 0xf000 {
                        0 => a + b,
                        4096 => a - b,
                        8192 => a * b,
                        12288 => a / b,
                        16384 => a % b,
                        _ => panic!("unsupported operation"),
                    };
                    let target = address(
                        if flags & 16 != 0 {
                            value(memory, command.args[0], context)
                        } else {
                            command.args[0]
                        },
                        context,
                    );
                    let old = *memory.get(&target).unwrap_or(&0);
                    memory.insert(
                        target,
                        match flags & 0xf00 {
                            0 => result,
                            256 => old + result,
                            512 => old - result,
                            _ => panic!("unsupported assignment"),
                        },
                    );
                }
                111 => {
                    let a = value(memory, command.args[1], context);
                    let b = value(memory, command.args[2], context);
                    let condition = match command.args[3] {
                        0 => a > b,
                        1 => a >= b,
                        2 => a == b,
                        3 => a <= b,
                        4 => a < b,
                        5 => a != b,
                        _ => panic!("unsupported condition"),
                    };
                    if !condition {
                        pc += commands[pc + 1..]
                            .iter()
                            .position(|c| c.depth == command.depth && matches!(c.code, 420 | 499))
                            .unwrap()
                            + 1;
                    }
                }
                420 => {
                    pc += commands[pc + 1..]
                        .iter()
                        .position(|c| c.depth == command.depth && c.code == 499)
                        .unwrap()
                        + 1;
                }
                0 | 401 | 499 | 212 => {}
                code => panic!("unexpected dispatch command {code}"),
            }
            pc += 1;
        }
    }
    fn lookup(commands: &[Command], root: i32, index: usize) -> (i32, bool) {
        let mut memory = HashMap::from([(root + 45, index as i32)]);
        execute(commands, root, &mut memory);
        (memory[&(root + 40)], memory[&(root + 21)] == 1)
    }

    #[test]
    fn old_lock_storage_is_reset_and_deleted_slots_do_not_restore_values() {
        let original = CommonEvents::read(&[
            0, b'W', 0, 0, b'O', b'L', 0, b'F', b'C', 0, 0x90, 0, 0, 0, 0, 0x89,
        ])
        .unwrap();
        let entries = [Entry {
            reference: 2_000_000,
            string: false,
            name: String::new(),
            group: String::new(),
            alias: None,
        }];
        let patched = CommonEvents::read(&compile(&original, &entries).unwrap()).unwrap();
        let root = common(0, 0);
        let key = common(3, 10);
        let init = &patched.events[0].commands;
        let end = init.iter().position(|c| c.code == 212).unwrap();
        let mut memory = HashMap::from([(root + 98, 0), (root + 54, 500), (key, 123)]);
        execute(&init[..end], root, &mut memory);
        assert_eq!(memory[&(root + 98)], LOCK_FORMAT);
        assert_eq!(memory[&(root + 54)], 0);
        assert_eq!(memory[&key], 0);
        memory.extend([
            (key, 1),
            (key + 1, 777),
            (key + 2, 2_000_000),
            (key + 3, 0),
            (2_000_000, 987),
        ]);
        let worker = &patched.events[3].commands;
        let end = worker.iter().position(|c| c.code == 180).unwrap();
        execute(&worker[..end], common(3, 0), &mut memory);
        assert_eq!(memory[&2_000_000], 777);
        memory.extend([(key, -1), (2_000_000, 987)]);
        execute(&worker[..end], common(3, 0), &mut memory);
        assert_eq!(memory[&2_000_000], 987);
    }

    #[test]
    fn full_address_space_uses_bounded_dispatch_and_preserves_millionth_index() {
        let mut entries = Vec::with_capacity(crate::catalog::MAX_ENTRIES);
        let mut push = |reference, string| {
            entries.push(Entry {
                reference,
                string,
                name: String::new(),
                group: String::new(),
                alias: None,
            })
        };
        for id in 0..10_000 {
            push(2_000_000 + id, false);
        }
        for id in 0..10_000 {
            push(3_000_000 + id, true);
        }
        for group in 1..=9 {
            for id in 0..10_000 {
                push(2_000_000 + group * 100_000 + id, false);
            }
        }
        for row in 0..10_000 {
            for field in 0..100 {
                push(1_100_000_000 + row * 100 + field, field % 2 == 1);
            }
        }
        assert_eq!(entries.len(), crate::catalog::MAX_ENTRIES);
        let root = common(300, 0);
        let mut code = Code::default();
        dispatch(&mut code, &ranges(&entries).unwrap(), root);
        assert!(code.commands.len() < 1000);
        for index in [
            0, 9999, 10_000, 19_999, 20_000, 109_999, 110_000, 110_001, 999_999, 1_000_000,
            1_000_001, 1_109_998, 1_109_999,
        ] {
            assert_eq!(
                lookup(&code.commands, root, index),
                (entries[index].reference, entries[index].string),
                "index {index}"
            );
        }
    }
}
