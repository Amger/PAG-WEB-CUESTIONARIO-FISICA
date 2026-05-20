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
        descripcion: "Selecciona una sola opcion.",
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
        descripcion: "Esta pregunta acepta multiples respuestas.",
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

    if (!options.length || !options.some((option) => option.correcta)) {
        return null;
    }

    const multipleCorrect = options.filter((option) => option.correcta).length > 1;
    const questionId = question.id ?? index + 1;
    const questionImage = resolveQuestionImagePath(question.imagen, questionId);

    return {
        id: questionId,
        enunciado: repairMojibake(question.enunciado ?? question.pregunta ?? `Pregunta ${index + 1}`),
        descripcion: repairMojibake(question.descripcion ?? ""),
        imagen: questionImage,
        imagenAlt: repairMojibake(question.imagenAlt ?? question.enunciado ?? `Imagen de la pregunta ${index + 1}`),
        descripcionImagen: repairMojibake(question.descripcionImagen ?? null),
        multipleCorrect,
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

    const selectedAnswers = state.userAnswers[question.id] ?? [];
    const inputType = question.multipleCorrect ? "checkbox" : "radio";
    const markerShape = question.multipleCorrect ? "multiple" : "single";
    const hasQuestionImage = Boolean(question.imagen);

    elements.questionCounter.textContent = `Pregunta ${state.currentQuestionIndex + 1} de ${state.questions.length}`;
    elements.questionMode.textContent = question.multipleCorrect
        ? "Respuesta multiple"
        : "Respuesta unica";
    elements.progressBar.style.width = `${((state.currentQuestionIndex + 1) / state.questions.length) * 100}%`;
    elements.questionContainer.className = `question-container${hasQuestionImage ? " has-question-image" : ""}`;

    elements.questionContainer.innerHTML = `
        <div class="question-wrapper">
            <header class="question-header">
                <h2>${escapeHtml(question.enunciado)}</h2>
                ${question.descripcion ? `<p>${escapeHtml(question.descripcion)}</p>` : ""}
            </header>

            <div class="options-list">
                ${question.opciones.map((option, optionIndex) => `
                    <div class="option-card">
                        <input
                            class="option-input"
                            id="question-${question.id}-option-${option.id}"
                            name="question-${question.id}"
                            type="${inputType}"
                            value="${escapeAttribute(option.id)}"
                            ${selectedAnswers.includes(option.id) ? "checked" : ""}
                        >
                        <label
                            class="option-label ${selectedAnswers.includes(option.id) ? "selected" : ""}"
                            for="question-${question.id}-option-${option.id}"
                        >
                            <div class="option-topline">
                                <span class="option-marker ${markerShape}">X</span>
                                <span class="option-text">
                                    <strong>${String.fromCharCode(65 + optionIndex)}.</strong>
                                    ${option.texto ? escapeHtml(option.texto) : ""}
                                </span>
                            </div>
                            ${renderFigure(option.imagen, option.imagenAlt, option.descripcionImagen, "option-figure")}
                        </label>
                    </div>
                `).join("")}
            </div>
        </div>

        ${hasQuestionImage ? `
            <div class="question-image-side">
                ${renderFigure(question.imagen, question.imagenAlt, question.descripcionImagen, "question-figure")}
            </div>
        ` : ""}
    `;

    renderQuestionTabs();


    bindQuestionInputs(question);
    updateNavigationButtons();
    updateFeedbackForCurrentQuestion();
}

function bindQuestionInputs(question) {
    const inputs = elements.questionContainer.querySelectorAll(".option-input");

    inputs.forEach((input) => {
        input.addEventListener("change", () => {
            const selected = Array.from(inputs)
                .filter((item) => item.checked)
                .map((item) => item.value);

            state.userAnswers[question.id] = selected;
            updateSelectedStyles();
            clearFeedbackVisibility();
        });
    });
}

function updateSelectedStyles() {
    const labels = elements.questionContainer.querySelectorAll(".option-label");
    const inputs = elements.questionContainer.querySelectorAll(".option-input");

    labels.forEach((label) => label.classList.remove("selected"));

    inputs.forEach((input) => {
        if (input.checked) {
            input.nextElementSibling?.classList.add("selected");
        }
    });
}

function checkCurrentAnswer() {
    const question = state.questions[state.currentQuestionIndex];
    const userAnswer = [...(state.userAnswers[question.id] ?? [])].sort();

    if (!userAnswer.length) {
        showFeedback("Selecciona al menos una respuesta antes de enviar.", "error");
        return;
    }

    const correctAnswer = question.opciones
        .filter((option) => option.correcta)
        .map((option) => option.id)
        .sort();

    const isCorrect = arraysMatch(userAnswer, correctAnswer);
    state.checkedAnswers[question.id] = {
        isCorrect,
        message: isCorrect
            ? "Respuesta correcta."
            : buildIncorrectMessage(question)
    };

    updateFeedbackForCurrentQuestion();
}

function buildIncorrectMessage(question) {
    const correctLabels = question.opciones
        .map((option, index) => ({ ...option, label: String.fromCharCode(65 + index) }))
        .filter((option) => option.correcta)
        .map((option) => option.label)
        .join(", ");

    return question.multipleCorrect
        ? `Respuesta incorrecta. Las opciones correctas son: ${correctLabels}.`
        : `Respuesta incorrecta. La opcion correcta es: ${correctLabels}.`;
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
    elements.feedback.textContent = "";
}

function showFeedback(message, type) {
    elements.feedback.className = `feedback is-visible ${type}`;
    elements.feedback.textContent = message;
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
    elements.questionContainer.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
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
            ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
        </figure>
    `;
}

function arraysMatch(first, second) {
    return first.length === second.length && first.every((value, index) => value === second[index]);
}


function renderQuestionTabs() {
    const tabs = state.questions.map((question, index) => `
        <button
            class="question-tab ${index === state.currentQuestionIndex ? 'active' : ''}"
            data-index="${index}"
            type="button"
        >
            ${index + 1}
        </button>
    `).join("");

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
