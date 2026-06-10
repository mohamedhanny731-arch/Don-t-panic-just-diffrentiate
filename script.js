const display = document.getElementById("display");

function add(value) {
    display.value += value;
}

function clearDisplay() {
    display.value = "";
}

function calculate() {
    try {
        display.value = eval(display.value);
    } catch {
        display.value = "Error";
    }
}

(function loadMathJS() {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.2/math.min.js';
    script.onload = initCalculators;
    document.head.appendChild(script);
})();

function initCalculators() {
    const boxes = document.querySelectorAll('.integbox');
    setupCalc(boxes[0], 'integrate');
    setupCalc(boxes[1], 'differentiate');
}

function setupCalc(box, mode) {
    const input  = box.querySelector('.inputt');
    const button = box.querySelector('.solve');
    const output = box.querySelector('.content');
    button.addEventListener('click', () => compute(input.value.trim(), mode, output));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') compute(input.value.trim(), mode, output);
    });
}

function compute(raw, mode, output) {
    if (!raw) {
        showResult(output, 'Please enter an expression first.', true);
        return;
    }
    const expr = normalise(raw);
    try {
        let result;
        if (mode === 'differentiate') {
            result = prettify(math.derivative(expr, 'x').toString());
            showResult(output, `d/dx [ ${raw} ] = ${result}`);
        } else {
            result = integrate(expr);
            showResult(output, `∫ (${raw}) dx = ${result} + C`);
        }
    } catch (err) {
        showResult(output, `Couldn't parse "${raw}". Check your expression and try again.`, true);
        console.error(err);
    }
}

function showResult(output, text, isError = false) {
    output.textContent = text;
    output.style.color = isError ? '#FCA5A5' : '#F8FAFC';
}

function normalise(raw) {
    return raw
        .replace(/\s+/g, '')
        .replace(/([0-9])\(/g, '$1*(')
        .replace(/\)\(/g, ')*(')
        .replace(/([0-9])([a-df-wyzA-DF-WYZ])/g, '$1*$2')
        .replace(/\b(sin|cos|tan|log|ln|sqrt|exp|sec|csc|cot)\*\(/g, '$1(');
}

function prettify(expr) {
    return expr.replace(/\*\*/g, '^').replace(/\*/g, '·');
}

function integrate(expr) {
    const terms = splitTopLevel(expr);
    const results = terms.map((t, i) => integrateOneTerm(t.expr, t.sign, i === 0));
    return results.join(' ');
}

function splitTopLevel(expr) {
    const terms = [];
    let depth = 0, current = '', sign = '+';

    for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;

        if (depth === 0 && (ch === '+' || ch === '-') && i > 0 && current !== '') {
            terms.push({ expr: current, sign });
            sign = ch;
            current = '';
        } else {
            current += ch;
        }
    }
    if (current !== '') terms.push({ expr: current, sign });
    return terms;
}

function integrateOneTerm(term, sign, isFirst) {
    const signPrefix = isFirst
        ? (sign === '-' ? '-' : '')
        : (sign === '-' ? '- ' : '+ ');

    const result = matchAndIntegrate(term);

    if (result === null) {
        return `sorry but bit hard to solve`;
    }

    if (!isFirst && result.startsWith('-')) {
        return sign === '-'
            ? `- ${result.slice(1).trim()}`
            : `+ ${result}`;
    }

    return `${signPrefix}${result}`;
}

function matchAndIntegrate(term) {
    let m;

    const expPattern = /^\^(\(([^)]+)\)|(-?[\d.]+))$/;

    m = term.match(/^(-?[\d.]*)\*?x(\^(\(([^)]+)\)|(-?[\d.]+)))?$/);
    if (m) {
        const coeff = (m[1] === '' || m[1] === undefined) ? 1 : (m[1] === '-' ? -1 : parseFloat(m[1]));
        const expStr = m[4] || m[5];
        const exp = expStr !== undefined ? parseFraction(expStr) : 1;

        if (exp === -1) {
            const c = coeff === 1 ? '' : coeff === -1 ? '-' : niceNum(coeff) + '·';
            return `${c}ln|x|`;
        }
        const newExp = exp + 1;
        const newCoeff = coeff / newExp;
        const expDisplay = Number.isInteger(newExp) ? `${newExp}` : `(${toFractionStr(newExp) || niceNum(newExp)})`;
        return `${niceCoeff(newCoeff)}x^${expDisplay}`;
    }

    m = term.match(/^(-?[\d.]+)$/);
    if (m) {
        const c = parseFloat(m[1]);
        return `${niceCoeff(c)}x`;
    }

    if (/^e\^x$/.test(term) || /^exp\(x\)$/.test(term)) return `e^x`;

    m = term.match(/^(-?[\d.]+)\*?e\^x$/);
    if (m) return `${niceCoeff(parseFloat(m[1]))}e^x`;

    m = term.match(/^(-?[\d.]*)\*?e\^\((-?[\d.]+)\*?x\)$/);
    if (m) {
        const coeff = m[1] === '' || m[1] === '-' ? (m[1] === '-' ? -1 : 1) : parseFloat(m[1]);
        const a = parseFloat(m[2]);
        return `${niceCoeff(coeff / a)}e^(${a}x)`;
    }

    if (/^ln\(x\)$/.test(term)) return `x·ln(x) - x`;
    m = term.match(/^(-?[\d.]+)\*?ln\(x\)$/);
    if (m) return `${niceCoeff(parseFloat(m[1]))}(x·ln(x) - x)`;

    if (/^sqrt\(x\)$/.test(term)) return `(2/3)x^(3/2)`;
    m = term.match(/^(-?[\d.]+)\*?sqrt\(x\)$/);
    if (m) return `${niceCoeff(parseFloat(m[1]) * 2 / 3)}x^(3/2)`;

    const TRIG_ANTI = {
        sin: (a) => a === 1 ? `-cos(x)` : `-cos(${a}x)/${a}`,
        cos: (a) => a === 1 ? `sin(x)`  : `sin(${a}x)/${a}`,
        tan: (a) => a === 1 ? `-ln|cos(x)|` : `-ln|cos(${a}x)|/${a}`,
        sec: () => `ln|sec(x)+tan(x)|`,
        csc: () => `-ln|csc(x)+cot(x)|`,
    };

    m = term.match(/^(-?[\d.]*)\*?(sin|cos|tan|sec|csc)\((-?[\d.]*)\*?x\)$/);
    if (m) {
        const coeff = m[1] === '' || m[1] === undefined ? 1 : (m[1] === '-' ? -1 : parseFloat(m[1]));
        const fn    = m[2];
        const a     = m[3] === '' || m[3] === undefined ? 1 : parseFloat(m[3]);
        const anti  = TRIG_ANTI[fn](a);
        return coeff === 1 ? anti : `${niceCoeff(coeff)}(${anti})`;
    }

    m = term.match(/^(-?[\d.]*)\*?(sin|cos|tan|sec|csc)\(x\)$/);
    if (m) {
        const coeff = m[1] === '' || m[1] === undefined ? 1 : (m[1] === '-' ? -1 : parseFloat(m[1]));
        const fn    = m[2];
        const anti  = TRIG_ANTI[fn](1);
        return coeff === 1 ? anti : `${niceCoeff(coeff)}(${anti})`;
    }

    if (/^sec\^2\(x\)$/.test(term)) return `tan(x)`;
    if (/^csc\^2\(x\)$/.test(term)) return `-cot(x)`;

    return null;
}

function parseFraction(s) {
    s = s.replace(/[()]/g, '');
    if (s.includes('/')) {
        const [a, b] = s.split('/');
        return parseFloat(a) / parseFloat(b);
    }
    return parseFloat(s);
}

function toFractionStr(decimal) {
    const tolerance = 1e-6;
    for (let d = 2; d <= 100; d++) {
        const n = Math.round(decimal * d);
        if (Math.abs(n / d - decimal) < tolerance) return `${n}/${d}`;
    }
    return null;
}

function niceNum(n) {
    const frac = toFractionStr(Math.abs(n));
    if (frac) return (n < 0 ? '-' : '') + frac;
    return parseFloat(n.toPrecision(6)).toString();
}

function niceCoeff(n) {
    if (n === 1)  return '';
    if (n === -1) return '-';
    return niceNum(n);
}