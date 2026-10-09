use crate::{
    catalog::Entry,
    codec::{Command, CommonEvents, Definition},
    Result,
};

const SELF: i32 = 1_600_000;
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

#[derive(Clone)]
struct Lock {
    flag: i32,
    value: i32,
    counter: i32,
}
fn locks(entries: &[Entry], base: i32) -> (Vec<Lock>, usize) {
    let mut out = Vec::new();
    let mut event = 0;
    let mut nums = 0;
    let mut strings = 0;
    for entry in entries {
        let need = if entry.string { 1 } else { 2 };
        if nums + need > 89 || (entry.string && strings == 5) {
            event += 1;
            nums = 0;
            strings = 0;
        }
        let id = base + event;
        let flag = common(id, 10 + nums);
        nums += 1;
        let value = if entry.string {
            let value = common(id, 5 + strings);
            strings += 1;
            value
        } else {
            let value = common(id, 10 + nums);
            nums += 1;
            value
        };
        out.push(Lock {
            flag,
            value,
            counter: common(id, 99),
        });
    }
    (
        out,
        if entries.is_empty() {
            0
        } else {
            event as usize + 1
        },
    )
}

pub fn compile(original: &CommonEvents, entries: &[Entry]) -> Result<Vec<u8>> {
    if entries.is_empty() || entries.len() > 20_000 {
        return Err("WOLF: catalogue vide ou supérieur à 20 000 champs.".into());
    }
    let root_id = original.events.len() as i32;
    let lookup_id = root_id + 1;
    let (locks, workers) = locks(entries, root_id + 2);
    if root_id as usize + 3 + workers > 10_000 {
        return Err("WOLF: nombre de common events insuffisant.".into());
    }
    let root = common(root_id, 0);
    let mut lookup = Code::default();
    dispatch(&mut lookup, entries, &locks, root, 0, entries.len());
    let mut io = Code::default();
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
    io.test(SELF + 0, 2, -1);
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
    io.test(SELF + 0, 1, 0);
    io.test(SELF + 0, 4, entries.len() as i32);
    io.test(SELF + 1, 1, 0);
    io.test(SELF + 1, 3, 4);
    io.test(SELF + 1, 2, 2);
    io.text(SELF + 8, "Data/RPGMToolkit/input-\\cself[51].txt", false);
    io.emit(122, &[SELF + 6, 1281, SELF + 8], &[]);
    io.end();
    io.number(SELF + 45, SELF + 0, 0, 0);
    io.emit(210, &[500_000 + lookup_id, 0], &[]);
    io.number(SELF + 22, 0, 0, 0);
    io.number(SELF + 23, SELF + 31, 0, 32);
    io.test(SELF + 21, 2, 1);
    io.emit(122, &[SELF + 9, 2, SELF + 40], &[]);
    io.other();
    io.number(SELF + 20, SELF + 40, 0, 32);
    io.end();
    io.test(SELF + 1, 2, 1);
    io.test(SELF + 21, 2, 0);
    io.number(SELF + 40, SELF + 10, 0, 16);
    io.number(SELF + 32, SELF + 10, 0, 16);
    io.number(SELF + 20, SELF + 10, 0, 0);
    io.other();
    io.number(SELF + 22, 1, 0, 0);
    io.end();
    io.end();
    io.test(SELF + 1, 2, 2);
    io.test(SELF + 21, 2, 1);
    io.emit(122, &[SELF + 40, 17, SELF + 6], &[]);
    io.emit(122, &[SELF + 32, 17, SELF + 6], &[]);
    io.copy(SELF + 9, SELF + 6);
    io.other();
    io.number(SELF + 22, 1, 0, 0);
    io.end();
    io.end();
    io.test(SELF + 1, 2, 3);
    io.test(SELF + 23, 2, 0);
    io.test(SELF + 54, 4, 500);
    io.test(SELF + 21, 2, 1);
    io.emit(122, &[SELF + 32, 17, SELF + 9], &[]);
    io.other();
    io.number(SELF + 32, SELF + 20, 0, 16);
    io.end();
    io.number(SELF + 31, 1, 0, 16);
    io.number(SELF + 33, 1, 0, 272);
    io.number(SELF + 54, 1, 0, 256);
    io.number(SELF + 23, 1, 0, 0);
    io.other();
    io.number(SELF + 22, 3, 0, 0);
    io.end();
    io.end();
    io.end();
    io.test(SELF + 1, 2, 4);
    io.test(SELF + 23, 2, 1);
    io.number(SELF + 31, 0, 0, 16);
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
    ];
    for worker in 0..workers {
        let id = root_id + 2 + worker as i32;
        let counter = common(id, 99);
        let mut code = Code::default();
        code.label("freeze");
        for (entry, lock) in entries
            .iter()
            .zip(&locks)
            .filter(|(_, l)| l.counter == counter)
        {
            code.test(lock.flag, 2, 1);
            if entry.string {
                code.copy(entry.reference, lock.value);
            } else {
                code.number(entry.reference, lock.value, 0, 0);
            }
            code.end();
        }
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

fn dispatch(
    code: &mut Code,
    entries: &[Entry],
    locks: &[Lock],
    root: i32,
    start: usize,
    end: usize,
) {
    if end - start > 1 {
        let mid = (start + end) / 2;
        code.test(root + 45, 4, mid as i32);
        dispatch(code, entries, locks, root, start, mid);
        code.other();
        dispatch(code, entries, locks, root, mid, end);
        code.end();
        return;
    }
    let entry = &entries[start];
    let lock = &locks[start];
    code.number(root + 21, i32::from(entry.string), 0, 0);
    code.number(root + 40, entry.reference, 0, 4);
    code.number(root + 31, lock.flag, 0, 4);
    code.number(root + 32, lock.value, 0, 4);
    code.number(root + 33, lock.counter, 0, 4);
}
