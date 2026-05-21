const state = {
    currentQuestionIndex: 0,
    questions: [],
    userAnswers: {},
    checkedAnswers: {}
};

const elements = {
    questionCounter: document.getElementById("question-counter"),
    questionMode: document.getElementById("question-mode"),
    progressBar: document.getElementById("progress-bar"),
    questionContainer: document.getElementById("question-container"),
    prevButton: document.getElementById("prev-button"),
    nextButton: document.getElementById("next-button"),
    checkButton: document.getElementById("check-button"),
    feedback: document.getElementById("feedback"),
    jsonFileInput: document.getElementById("json-file-input"),
    questionTabs: document.getElementById("question-tabs")
};

const fallbackQuestions = [
    {
        id: 1,
        enunciado: "Cual de las siguientes magnitudes es vectorial?",
        descripcion: "",
        opciones: [
            { id: "a", texto: "Masa" },
            { id: "b", texto: "Temperatura" },
            { id: "c", texto: "Velocidad", correcta: true },
            { id: "d", texto: "Energia" }
        ]
    },
    {
        id: 2,
        enunciado: "Cuales de estas unidades pertenecen al Sistema Internacional?",
        descripcion: "",
        opciones: [
            { id: "a", texto: "Metro", correcta: true },
            { id: "b", texto: "Segundo", correcta: true },
            { id: "c", texto: "Libra" },
            { id: "d", texto: "Kelvin", correcta: true }
        ]
    }
];

const questionImageIds = new Set([
    2, 3, 9, 10, 14, 15, 26, 29, 30, 31, 34, 39, 40, 41, 42, 44, 47, 48, 53
]);

document.addEventListener("DOMContentLoaded", initQuiz);

async function initQuiz() {
    attachEvents();
    await loadQuestions();

    if (!state.questions.length) {
        renderEmptyState("No se encontraron preguntas validas para mostrar.");
        return;
    }

    renderQuestion();
}

function attachEvents() {
    elements.prevButton.addEventListener("click", () => changeQuestion(-1));
    elements.nextButton.addEventListener("click", () => changeQuestion(1));
    elements.checkButton.addEventListener("click", checkCurrentAnswer);
    elements.jsonFileInput.addEventListener("change", handleJsonFileSelection);
}

async function loadQuestions() {
    if (window.location.protocol === "file:") {
        const embeddedQuestions = loadEmbeddedQuestions();
        state.questions = embeddedQuestions.length
            ? embeddedQuestions
            : normalizeQuestions(fallbackQuestions);
        return;
    }

    try {
        const rawData = await loadPrimaryQuestionsFile();
        const questions = normalizeQuestions(rawData);

        state.questions = questions.length ? questions : normalizeQuestions(fallbackQuestions);
    } catch (error) {
        console.warn("Se usaran preguntas de ejemplo:", error);
        state.questions = normalizeQuestions(fallbackQuestions);
    }
}

async function loadPrimaryQuestionsFile() {
    const candidateFiles = [
        "fisica2_preguntas.json",
        "preguntas.json"
    ];

    for (const fileName of candidateFiles) {
        const response = await fetch(fileName, { cache: "no-store" });

        if (response.ok) {
            return response.json();
        }
    }

    throw new Error("No se pudo cargar ningun archivo JSON de preguntas.");
}

async function handleJsonFileSelection(event) {
    const file = event.target.files?.[0];

    if (!file) {
        return;
    }

    try {
        const rawText = await file.text();
        const parsed = JSON.parse(rawText);
        const questions = normalizeQuestions(parsed);

        if (!questions.length) {
            throw new Error("El archivo no contiene preguntas validas.");
        }

        state.questions = questions;
        state.currentQuestionIndex = 0;
        state.userAnswers = {};
        state.checkedAnswers = {};
        elements.checkButton.disabled = false;
        renderQuestion();
        showFeedback("Archivo JSON cargado correctamente.", "success");
    } catch (error) {
        showFeedback(error.message || "No se pudo cargar el archivo JSON.", "error");
    } finally {
        event.target.value = "";
    }
}

function loadEmbeddedQuestions() {
    const embeddedData = document.getElementById("preguntas-data")?.textContent;

    if (!embeddedData) {
        return [];
    }

    try {
        return normalizeQuestions(JSON.parse(embeddedData));
    } catch (error) {
        console.warn("No se pudo leer el bloque JSON embebido:", error);
        return [];
    }
}

function normalizeQuestions(rawData) {
    const list = Array.isArray(rawData) ? rawData : rawData?.preguntas;

    if (!Array.isArray(list)) {
        return [];
    }

    return list
        .map((question, index) => normalizeQuestion(question, index))
        .filter(Boolean);
}

function normalizeQuestion(question, index) {
    if (!question || !Array.isArray(question.opciones) || !question.opciones.length) {
        return null;
    }

    const options = question.opciones
        .map((option, optionIndex) => ({
            id: String(option.id ?? optionIndex),
            texto: repairMojibake(option.texto ?? option.label ?? option.respuesta ?? ""),
            correcta: Boolean(option.correcta),
            imagen: option.imagen ?? null,
            imagenAlt: repairMojibake(option.imagenAlt ?? option.texto ?? `Opcion ${optionIndex + 1}`),
            descripcionImagen: repairMojibake(option.descripcionImagen ?? null)
        }))
        .filter((option) => option.texto || option.imagen);

    if (!options.length) {
        return null;
    }

    const questionId = question.id ?? index + 1;
    const questionImage = resolveQuestionImagePath(question.imagen, questionId);

    return {
        id: questionId,
        enunciado: repairMojibake(question.enunciado ?? question.pregunta ?? `Pregunta ${index + 1}`),
        descripcion: repairMojibake(question.descripcion ?? ""),
        imagen: questionImage,
        imagenAlt: repairMojibake(question.imagenAlt ?? question.enunciado ?? `Imagen de la pregunta ${index + 1}`),
        descripcionImagen: repairMojibake(question.descripcionImagen ?? null),
        opciones: options
    };
}

function resolveQuestionImagePath(explicitImage, questionId) {
    if (explicitImage) {
        return explicitImage;
    }

    if (!questionImageIds.has(Number(questionId))) {
        return null;
    }

    return `img/Pregunta ${questionId}.png`;
}

function renderQuestion() {
    const question = state.questions[state.currentQuestionIndex];

    if (!question) {
        renderEmptyState("No hay preguntas disponibles.");
        return;
    }

    const selectedAnswers = state.userAnswers[question.id] ?? {};
    const hasQuestionImage = Boolean(question.imagen);

    elements.questionCounter.textContent = `Pregunta ${state.currentQuestionIndex + 1} de ${state.questions.length}`;
    elements.questionMode.textContent = "Verdadero / Falso";
    elements.progressBar.style.width = `${((state.currentQuestionIndex + 1) / state.questions.length) * 100}%`;
    elements.questionContainer.className = `question-container${hasQuestionImage ? " has-question-image" : ""}`;

    elements.questionContainer.innerHTML = `
        <div class="question-wrapper">
            <header class="question-header">
                <h2>${renderFormattedText(question.enunciado)}</h2>
                ${question.descripcion ? `<p>${renderFormattedText(question.descripcion)}</p>` : ""}
            </header>

            <div class="question-body${hasQuestionImage ? " has-side-image" : ""}">
                <div class="options-list">
                    ${question.opciones.map((option, optionIndex) => `
                        <div class="option-card">
                            <div class="option-label">
                                <div class="option-topline">
                                    <span class="option-text">
                                        <strong>${String.fromCharCode(65 + optionIndex)}.</strong>
                                        ${option.texto ? renderFormattedText(option.texto) : ""}
                                    </span>
                                </div>
                                ${renderFigure(option.imagen, option.imagenAlt, option.descripcionImagen, "option-figure")}
                                <div class="option-answer-buttons" role="group" aria-label="Respuesta para la opcion ${String.fromCharCode(65 + optionIndex)}">
                                    <button
                                        class="answer-toggle ${selectedAnswers[option.id] === true ? "selected true" : ""}"
                                        data-option-id="${escapeAttribute(option.id)}"
                                        data-value="true"
                                        type="button"
                                    >
                                        Verdadero
                                    </button>
                                    <button
                                        class="answer-toggle ${selectedAnswers[option.id] === false ? "selected false" : ""}"
                                        data-option-id="${escapeAttribute(option.id)}"
                                        data-value="false"
                                        type="button"
                                    >
                                        Falso
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join("")}
                </div>

                ${hasQuestionImage ? `
                    <div class="question-image-side">
                        ${renderFigure(question.imagen, question.imagenAlt, question.descripcionImagen, "question-figure")}
                    </div>
                ` : ""}
            </div>
        </div>
    `;

    renderQuestionTabs();
    bindQuestionInputs(question);
    updateNavigationButtons();
    updateFeedbackForCurrentQuestion();
    typesetMath(elements.questionContainer);
}

function bindQuestionInputs(question) {
    const buttons = elements.questionContainer.querySelectorAll(".answer-toggle");

    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            const optionId = button.dataset.optionId;
            const value = button.dataset.value === "true";

            state.userAnswers[question.id] = {
                ...(state.userAnswers[question.id] ?? {}),
                [optionId]: value
            };

            delete state.checkedAnswers[question.id];
            updateSelectedStyles(question);
            clearFeedbackVisibility();
            renderQuestionTabs();
        });
    });
}

function updateSelectedStyles(question) {
    const selectedAnswers = state.userAnswers[question.id] ?? {};
    const buttons = elements.questionContainer.querySelectorAll(".answer-toggle");

    buttons.forEach((button) => {
        const optionId = button.dataset.optionId;
        const value = button.dataset.value === "true";
        const isSelected = selectedAnswers[optionId] === value;

        button.classList.toggle("selected", isSelected);
        button.classList.toggle("true", isSelected && value);
        button.classList.toggle("false", isSelected && !value);
    });
}

function checkCurrentAnswer() {
    const question = state.questions[state.currentQuestionIndex];
    const userAnswer = state.userAnswers[question.id] ?? {};

    const unansweredOptions = question.opciones.filter((option) => typeof userAnswer[option.id] !== "boolean");

    if (unansweredOptions.length) {
        showFeedback("Debes marcar Verdadero o Falso en todas las opciones antes de enviar.", "error");
        return;
    }

    const isCorrect = question.opciones.every((option) => userAnswer[option.id] === option.correcta);
    state.checkedAnswers[question.id] = {
        isCorrect,
        message: isCorrect
            ? "Respuesta correcta."
            : buildIncorrectMessage(question)
    };

    updateFeedbackForCurrentQuestion();
    renderQuestionTabs();
}

function buildIncorrectMessage(question) {
    const expectedAnswers = question.opciones
        .map((option, index) => `${String.fromCharCode(65 + index)}: ${option.correcta ? "Verdadero" : "Falso"}`)
        .join(" | ");

    return `Respuesta incorrecta. Correccion: ${expectedAnswers}.`;
}

function updateFeedbackForCurrentQuestion() {
    const question = state.questions[state.currentQuestionIndex];
    const result = state.checkedAnswers[question.id];

    if (!result) {
        clearFeedbackVisibility();
        return;
    }

    showFeedback(result.message, result.isCorrect ? "success" : "error");
}

function clearFeedbackVisibility() {
    elements.feedback.className = "feedback";
    elements.feedback.innerHTML = "";
}

function showFeedback(message, type) {
    elements.feedback.className = `feedback is-visible ${type}`;
    elements.feedback.innerHTML = renderFormattedText(message);
    typesetMath(elements.feedback);
}

function changeQuestion(direction) {
    const nextIndex = state.currentQuestionIndex + direction;

    if (nextIndex < 0 || nextIndex >= state.questions.length) {
        return;
    }

    state.currentQuestionIndex = nextIndex;
    renderQuestion();
}

function updateNavigationButtons() {
    elements.prevButton.disabled = state.currentQuestionIndex === 0;
    elements.nextButton.disabled = state.currentQuestionIndex === state.questions.length - 1;
}

function renderEmptyState(message) {
    elements.questionCounter.textContent = "Pregunta 0 de 0";
    elements.questionMode.textContent = "Sin contenido";
    elements.progressBar.style.width = "0%";
    elements.questionContainer.innerHTML = `<p class="empty-state">${renderFormattedText(message)}</p>`;
    elements.prevButton.disabled = true;
    elements.nextButton.disabled = true;
    elements.checkButton.disabled = true;
    clearFeedbackVisibility();
}

function renderFigure(image, alt, caption, className) {
    if (!image) {
        return "";
    }

    return `
        <figure class="${className}">
            <img src="${escapeAttribute(image)}" alt="${escapeAttribute(alt ?? "")}">
            ${caption ? `<figcaption>${renderFormattedText(caption)}</figcaption>` : ""}
        </figure>
    `;
}

function renderQuestionTabs() {
    const tabs = state.questions.map((question, index) => {
        const isActive = index === state.currentQuestionIndex;
        const result = state.checkedAnswers[question.id];
        let statusClass = "";
        
        if (result) {
            statusClass = result.isCorrect ? "correct" : "incorrect";
        }
        
        return `
        <button
            class="question-tab ${isActive ? 'active' : ''} ${statusClass}"
            data-index="${index}"
            type="button"
            title="${result ? (result.isCorrect ? 'Respuesta correcta' : 'Respuesta incorrecta') : 'Sin responder'}"
        >
            ${index + 1}
        </button>
    `;
    }).join("");

    elements.questionTabs.innerHTML = tabs;

    elements.questionTabs.querySelectorAll(".question-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            const index = parseInt(tab.dataset.index, 10);
            state.currentQuestionIndex = index;
            renderQuestion();
        });
    });
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function escapeAttribute(text) {
    return escapeHtml(text);
}

function renderFormattedText(text) {
    return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

function typesetMath(container) {
    if (!container) {
        return;
    }

    if (!window.MathJax?.typesetPromise) {
        bindMathJaxLoadHandler();
        return;
    }

    window.MathJax.typesetClear?.([container]);
    window.MathJax.typesetPromise([container]).catch((error) => {
        console.warn("No se pudo renderizar MathJax:", error);
    });
}

function bindMathJaxLoadHandler() {
    const script = document.getElementById("mathjax-script");

    if (!script || script.dataset.bound === "true") {
        return;
    }

    script.dataset.bound = "true";
    script.addEventListener("load", () => {
        typesetMath(elements.questionContainer);
        typesetMath(elements.feedback);
    }, { once: true });
}

function repairMojibake(value) {
    if (typeof value !== "string") {
        return value;
    }

    let repaired = value;

    for (let index = 0; index < 3; index += 1) {
        if (!looksLikeMojibake(repaired)) {
            break;
        }

        try {
            const nextValue = decodeURIComponent(escape(repaired));

            if (!nextValue || nextValue === repaired) {
                break;
            }

            repaired = nextValue;
        } catch (error) {
            break;
        }
    }

    return repaired;
}

function looksLikeMojibake(text) {
    return /(?:Ã.|Â.|â.|Î.|Ï.|Ì.)/.test(text);
}
function looksLikeMojibake(text) {
    return /[ÃÂâÎÏÌ]/.test(text);
}
