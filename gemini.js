// gemini.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// --- Chargement dynamique des prompts ---
const promptsFilePath = path.join(__dirname, 'prompts.json');
let prompts = {};

function loadPrompts() {
  try {
    const data = fs.readFileSync(promptsFilePath, 'utf8');
    prompts = JSON.parse(data);
    console.log('[Gemini] Fichier de prompts chargé avec succès.');
  } catch (error) {
    console.error('[Gemini] ERREUR CRITIQUE: Impossible de charger prompts.json.', error);
    prompts = { questions: "Génère exactement ${count} questions...", course: "Tu es un professeur de français exceptionnel..." };
  }
}
loadPrompts();

// --- Gestion des Clés API (inchangée) ---
const apiKeys = (process.env.GEMINI_API_KEYS || "").split(',').filter(key => key.trim() !== '');
if (apiKeys.length === 0) {
  throw new Error("Aucune clé API Gemini trouvée dans GEMINI_API_KEYS.");
}
let currentApiKeyIndex = 0;
let genAI;

function initializeGenAI() {
  const currentKey = apiKeys[currentApiKeyIndex];
  console.log(`[Gemini] Initialisation avec la clé API index ${currentApiKeyIndex}.`);
  genAI = new GoogleGenerativeAI(currentKey);
}
initializeGenAI();

const delay = ms => new Promise(res => setTimeout(res, ms));

async function executeWithRetryAndRotation(apiCallExecutor) {
  let lastError = null;
  for (let keyAttempt = 0; keyAttempt < apiKeys.length; keyAttempt++) {
    const MAX_OVERLOAD_RETRIES = 3;
    for (let retry = 0; retry < MAX_OVERLOAD_RETRIES; retry++) {
      try {
        return await apiCallExecutor();
      } catch (error) {
        lastError = error;
        const errorMessage = error.message ? error.message.toLowerCase() : "";
        if (errorMessage.includes('quota') || errorMessage.includes('resource has been exhausted')) {
          console.warn(`[Gemini] Erreur de Quota pour la clé index ${currentApiKeyIndex}.`);
          break;
        }
        if (errorMessage.includes('overloaded') || errorMessage.includes('model is overloaded')) {
          if (retry === MAX_OVERLOAD_RETRIES - 1) {
            console.error(`[Gemini] Le modèle est toujours surchargé après ${MAX_OVERLOAD_RETRIES} tentatives.`);
            break;
          }
          const waitTime = Math.pow(2, retry) * 1000;
          console.warn(`[Gemini] Modèle surchargé. Nouvelle tentative dans ${waitTime / 1000}s...`);
          await delay(waitTime);
          continue;
        }
        throw error;
      }
    }
    console.log(`[Gemini] Passage à la clé d'API suivante.`);
    currentApiKeyIndex = (currentApiKeyIndex + 1) % apiKeys.length;
    initializeGenAI();
  }
  console.error("[Gemini] L'exécution a échoué après avoir essayé toutes les clés.");
  throw lastError || new Error("Échec de l'appel à l'API Gemini.");
}

// ==========================================================
// ===         NOUVEAU PARSEUR JSON ULTRA-ROBUSTE         ===
// ==========================================================
/**
 * Tente de parser une chaîne JSON potentiellement mal formée en nettoyant les erreurs courantes.
 * @param {string} text - Le texte brut renvoyé par l'IA.
 * @returns {object} L'objet JavaScript parsé.
 * @throws {Error} Si le JSON reste invalide après nettoyage.
 */
function robustJsonParse(text) {
  // 1. Nettoyage initial : enlève les marqueurs de code et les espaces superflus.
  let cleanedText = text.replace(/^```json\s*|```\s*$/g, '').trim();

  // 2. Recherche du début et de la fin du JSON ([...])
  const jsonStartIndex = cleanedText.indexOf('[');
  const jsonEndIndex = cleanedText.lastIndexOf(']');
  if (jsonStartIndex === -1 || jsonEndIndex === -1) {
    throw new Error("Format JSON invalide : Délimiteurs [ ou ] non trouvés.");
  }
  let jsonString = cleanedText.substring(jsonStartIndex, jsonEndIndex + 1);

  // 3. Correction des erreurs les plus fréquentes :
  //    - Ajoute des guillemets doubles manquants autour des clés (ex: {text:...} -> {"text":...})
  jsonString = jsonString.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
  //    - Supprime les virgules en trop avant une accolade ou un crochet fermant (trailing commas).
  jsonString = jsonString.replace(/,\s*([\}\]])/g, '$1');

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("[Gemini Parser] Le JSON est resté invalide même après nettoyage.");
    console.error("--- JSON problématique ---");
    console.error(jsonString);
    console.error("--------------------------");
    throw error;
  }
}

async function generateContentWithRetries(prompt, options = {}) {
  const { expectJson = false, maxRetries = 3 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[Gemini] Nouvelle tentative de génération de contenu (${attempt}/${maxRetries})...`);
      }

      const responseText = await executeWithRetryAndRotation(async () => {
        const generationConfig = expectJson ? { response_mime_type: "application/json" } : {};
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro", generationConfig });
        const result = await model.generateContent(prompt);
        return result.response.text();
      });

      return expectJson ? robustJsonParse(responseText) : responseText;

    } catch (error) {
      console.warn(`[Gemini] Tentative ${attempt} échouée. Raison : ${error.message}`);
      if (attempt === maxRetries) {
        console.error("Échec final de la génération de contenu après toutes les tentatives.");
        throw error;
      }
      await delay(1000);
    }
  }
}

async function generateHint(questionText) {
  const prompt = `Tu es un professeur de français. Donne un indice utile pour aider à répondre à cette question sans donner la réponse directe. Question: ${questionText}`;
  try {
    return await generateContentWithRetries(prompt);
  } catch (error) {
    console.error('Erreur finale dans generateHint:', error);
    throw new Error("Impossible de générer un indice.");
  }
}

async function generateAnalysis(resultsData) {
  const prompt = `Analyse les résultats de ce quiz de français et donne des conseils personnalisés en français. Sois encourageant et concis.\n\nRésultats:\n- Score: ${resultsData.score}\n- Bonnes réponses: ${resultsData.correctAnswers}/${resultsData.totalQuestions}\n- Temps moyen par question: ${resultsData.avgTime}s\n- Thèmes où des erreurs ont été commises: ${resultsData.weakAreas.join(', ') || 'Aucun'}\n\nDonne une analyse avec des conseils pour progresser.`;
  try {
    return await generateContentWithRetries(prompt);
  } catch (error) {
    console.error('Erreur finale dans generateAnalysis:', error);
    throw new Error("Impossible de générer une analyse.");
  }
}

async function generateNewQuestions(theme, level, language, count, courseContent = null, existingQuestions = []) {
  let promptTemplate = prompts.questions;
  
  let prompt = promptTemplate
    .replace(/\$\{count\}/g, count)
    .replace(/\$\{language\}/g, language)
    .replace(/\$\{theme\}/g, theme)
    .replace(/\$\{level\}/g, level);
  
  if (courseContent && courseContent.trim() !== '') {
    prompt += `
      
      IMPORTANT : Tu dois baser TOUTES tes questions EXCLUSIVEMENT sur le contenu du cours suivant. N'invente aucune information qui ne s'y trouve pas.
      
      --- CONTENU DU COURS DE RÉFÉRENCE ---
      ${courseContent}
      --- FIN DU CONTENU DU COURS ---
      `;
  }
  
  if (existingQuestions && existingQuestions.length > 0) {
    prompt += `
      
      ---
      INSTRUCTION ADDITIONNELLE TRÈS IMPORTANTE :
      Voici une liste de questions qui ont déjà été générées par le passé.
      Tu ne dois ABSOLUMENT PAS générer des questions identiques ou sémantiquement très similaires à celles de cette liste.
      Ton objectif est de créer des questions entièrement NOUVELLES ET UNIQUES.
      
      LISTE DES QUESTIONS À ÉVITER :
      - ${existingQuestions.join('\n- ')}
      ---
      `;
  }
  
  try {
    const questions = await generateContentWithRetries(prompt, { expectJson: true });
    
    if (!Array.isArray(questions) || questions.length === 0 || !questions[0].text) {
      throw new Error("La réponse finale n'est pas un tableau de questions valide.");
    }
    
    console.log(`[Gemini] ${questions.length} questions générées avec succès pour le thème "${theme}".`);
    return questions;
  } catch (error) {
    console.error("Erreur finale dans generateNewQuestions:", error);
    throw new Error("Impossible de générer des questions pour le moment.");
  }
}

async function generateChatResponse(message, history, context = null) {
  let prompt;
  if (context) {
    prompt = `
      Tu es un assistant pédagogique expert en langue française. Un utilisateur a une question concernant un quiz.
      Contexte : Question : "${context.quizQuestion}", Options : [${context.quizOptions.join(", ")}], Bonne réponse : "${context.quizCorrectAnswer}".
      Question de l'utilisateur : "${context.userQuery}".
      Explique-lui clairement pourquoi la bonne réponse est correcte.`;
  } else {
    try {
      return await executeWithRetryAndRotation(async () => {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        const chat = model.startChat({
          history: history.map(msg => ({
            role: msg.username === 'Gemini' ? 'model' : 'user',
            parts: [{ text: msg.message }],
          })),
        });
        const result = await chat.sendMessage(message);
        return result.response.text();
      });
    } catch(error) {
      console.error('Erreur finale dans generateChatResponse (conversation):', error);
      throw error;
    }
  }

  try {
    return await generateContentWithRetries(prompt);
  } catch (error) {
    console.error('Erreur finale dans generateChatResponse (contexte):', error);
    throw error;
  }
}

async function generateCourse(theme) {
  let promptTemplate = prompts.course;
  const prompt = promptTemplate.replace(/\$\{theme\}/g, theme);
  
  try {
    const courseContent = await generateContentWithRetries(prompt);
    console.log(`[Gemini] Cours généré avec succès pour le thème "${theme}".`);
    return courseContent;
  } catch (error) {
    console.error("Erreur finale dans generateCourse:", error);
    throw new Error(`Impossible de générer un cours pour le thème "${theme}".`);
  }
}

async function validateAndRefineQuestions(questions, theme, courseContent) {
  console.log(`[Gemini] Lancement de la phase de validation et de correction pour ${questions.length} questions...`);
  
  const validationPrompt = `
    Tu es un contrôleur qualité extrêmement rigoureux pour un quiz de langue française. Ton unique mission est de filtrer et de perfectionner une liste de questions générées par une IA.
    
    Voici la liste de questions brutes à analyser :
    ${JSON.stringify(questions, null, 2)}
    
    Tu dois examiner chaque question une par une et ne conserver **QUE** celles qui respectent **ABSOLUMENT TOUS** les critères suivants. Si une question échoue à un seul critère, tu la supprimes de la liste finale.
    
    ### CHECKLIST DE VALIDATION IMPITOYABLE :
    1.  **Est-ce une vraie question ?** Le champ \`text\` doit poser une question qui a du sens. Une question comme "Lequel de ces mots est correct ?" est valide.
    2.  **Y a-t-il exactement 4 options ?** Le tableau \`options\` doit contenir **strictement 4** chaînes de caractères. Ni plus, ni moins.
    3.  **Les options sont-elles uniques ?** Il ne doit y avoir aucun doublon dans le tableau \`options\`. "Téléphone" et "téléphone" sont des doublons.
    4.  **La bonne réponse est-elle valide ?** La valeur de \`correctAnswer\` doit être présente et correspondre **exactement** à l'une des 4 options.
    5.  **L'explication est-elle pertinente ?** Le champ \`explanation\` doit être une explication claire et en français.
    6.  **La question est-elle autonome ?** La question ne doit pas faire référence à "l'exemple ci-dessus" ou au "texte du cours". Elle doit être compréhensible seule. Si elle ne l'est pas, tu peux la reformuler pour la rendre autonome, mais seulement si elle est de haute qualité.
    
    Après ton analyse, renvoie UNIQUEMENT un tableau JSON valide contenant les questions qui ont passé tous les contrôles. Ne renvoie rien d'autre.
  `;
  
  try {
    const refinedQuestions = await generateContentWithRetries(validationPrompt, { expectJson: true });
    
    if (!Array.isArray(refinedQuestions)) {
      console.warn('[Gemini Corrector] La réponse du correcteur n\'était pas un tableau. Retour des questions originales.');
      return questions;
    }
    
    console.log(`[Gemini] Correction terminée. ${refinedQuestions.length}/${questions.length} questions ont été validées.`);
    return refinedQuestions;

  } catch (error) {
    console.error("[Gemini Corrector] Erreur durant la phase de correction. Les questions originales seront utilisées.", error);
    return questions;
  }
}

module.exports = {
  generateHint,
  generateAnalysis,
  generateNewQuestions,
  generateChatResponse,
  generateCourse,
  validateAndRefineQuestions,
  loadPrompts
};