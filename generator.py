import os
import re
import json
import subprocess
import urllib.parse
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)
DECKS_FILE = os.path.join(DATA_DIR, "decks.json")
PLAYLIST_FILE = os.path.join(DATA_DIR, "playlist_cache.json")

# Judy's 54-course Complete French for Beginners playlist
PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLj0g_C56bhRkMhBschCdIRd_bJfD2nBgG"

COURSE_1_PRECOMPUTED_CARDS = [
    {
        "id": "c1_01",
        "french": "le chocolat",
        "spanish": "el chocolate",
        "english": "the chocolate",
        "phonetics": "[lə ʃɔ.kɔ.la]",
        "tip": "La 'ch' en francés suena como 'sh' inglesa o como mandar a callar ('shhh'), nunca 'ch' fuerte española.",
        "grammar": "Sustantivo masculino (le)",
        "tef_level": "A1",
        "timestamp": 70,
        "tags": ["vocabulario", "cognados", "fonetica"]
    },
    {
        "id": "c1_02",
        "french": "l'hôpital",
        "spanish": "el hospital",
        "english": "the hospital",
        "phonetics": "[lo.pi.tal]",
        "tip": "La 'h' inicial es muda en francés; se produce elisión del artículo: 'le' pasa a 'l''.",
        "grammar": "Elisión obligatoria (l')",
        "tef_level": "A1",
        "timestamp": 81,
        "tags": ["vocabulario", "cognados", "elision"]
    },
    {
        "id": "c1_03",
        "french": "urgent",
        "spanish": "urgente",
        "english": "urgent",
        "phonetics": "[yʁ.ʒɑ̃]",
        "tip": "La 'u' francesa se pronuncia con labios en posición de 'u' y emitiendo 'i'. La 'g' suena suave como 'j' francesa [ʒ].",
        "grammar": "Adjetivo masculino",
        "tef_level": "A1",
        "timestamp": 87,
        "tags": ["vocabulario", "adjetivo", "fonetica"]
    },
    {
        "id": "c1_04",
        "french": "un animal",
        "spanish": "un animal",
        "english": "an animal",
        "phonetics": "[œ̃.n‿a.ni.mal]",
        "tip": "'un' se pronuncia nasal [œ̃]. Se une con 'animal' en enlace fonético (liaison).",
        "grammar": "Artículo indefinido masculino (un)",
        "tef_level": "A1",
        "timestamp": 97,
        "tags": ["vocabulario", "fonetica", "liaison"]
    },
    {
        "id": "c1_05",
        "french": "C'est...",
        "spanish": "Es... / Esto es...",
        "english": "It is...",
        "phonetics": "[sɛ]",
        "tip": "Contracción obligatoria de 'ce' (esto) + 'est' (es). Piedra angular para formar oraciones en francés.",
        "grammar": "Pronombre demostrativo + verbo être",
        "tef_level": "A1",
        "timestamp": 108,
        "tags": ["gramatica", "oraciones", "estructura_base"]
    },
    {
        "id": "c1_06",
        "french": "C'est un animal.",
        "spanish": "Es un animal.",
        "english": "It is an animal.",
        "phonetics": "[sɛ.t‿œ̃.n‿a.ni.mal]",
        "tip": "LIAISON OBLIGATORIA: la 't' de 'c'est' se une a 'un', y la 'n' de 'un' se une a 'animal'. Suena como una sola palabra fluida.",
        "grammar": "Liaison obligatoria",
        "tef_level": "A1",
        "timestamp": 130,
        "tags": ["oraciones", "liaison", "fonetica"]
    },
    {
        "id": "c1_07",
        "french": "difficile",
        "spanish": "difícil",
        "english": "difficult",
        "phonetics": "[di.fi.sil]",
        "tip": "La 'e' final en francés no se pronuncia. Termina netamente en el sonido [l], no digas 'dificilé'.",
        "grammar": "Adjetivo invariable m/f",
        "tef_level": "A1",
        "timestamp": 164,
        "tags": ["adjetivo", "fonetica"]
    },
    {
        "id": "c1_08",
        "french": "C'est difficile.",
        "spanish": "Es difícil.",
        "english": "It is difficult.",
        "phonetics": "[sɛ di.fi.sil]",
        "tip": "Pronunciación conectada: 'sè-di-fi-sil'.",
        "grammar": "Estructura C'est + adjetivo",
        "tef_level": "A1",
        "timestamp": 185,
        "tags": ["oraciones", "adjetivo"]
    },
    {
        "id": "c1_09",
        "french": "impossible",
        "spanish": "imposible",
        "english": "impossible",
        "phonetics": "[ɛ̃.pɔ.sibl]",
        "tip": "'im-' al inicio de palabra suena nasal [ɛ̃]. La terminación '-ble' es seca y suave.",
        "grammar": "Adjetivo invariable",
        "tef_level": "A1",
        "timestamp": 198,
        "tags": ["adjetivo", "fonetica", "nasales"]
    },
    {
        "id": "c1_10",
        "french": "C'est impossible.",
        "spanish": "Es imposible.",
        "english": "It is impossible.",
        "phonetics": "[sɛ.t‿ɛ̃.pɔ.sibl]",
        "tip": "Liaison: la 't' de c'est se conecta con 'im-' formando [sɛ-tɛ̃-pɔ-sibl].",
        "grammar": "C'est + liaison adjetival",
        "tef_level": "A1",
        "timestamp": 210,
        "tags": ["oraciones", "liaison"]
    },
    {
        "id": "c1_11",
        "french": "important",
        "spanish": "importante",
        "english": "important",
        "phonetics": "[ɛ̃.pɔʁ.tɑ̃]",
        "tip": "Doble vocal nasal: 'im' -> [ɛ̃], 'an' -> [ɑ̃]. La 't' final NO se pronuncia.",
        "grammar": "Adjetivo masculino",
        "tef_level": "A1",
        "timestamp": 232,
        "tags": ["adjetivo", "nasales", "fonetica"]
    },
    {
        "id": "c1_12",
        "french": "C'est important.",
        "spanish": "Es importante.",
        "english": "It is important.",
        "phonetics": "[sɛ.t‿ɛ̃.pɔʁ.tɑ̃]",
        "tip": "Liaison obligatoria de la 't': [sɛ-tɛ̃-pɔʁ-tɑ̃].",
        "grammar": "C'est + adjetivo con liaison",
        "tef_level": "A1",
        "timestamp": 266,
        "tags": ["oraciones", "liaison"]
    },
    {
        "id": "c1_13",
        "french": "moi",
        "spanish": "mí / yo (tónico)",
        "english": "me",
        "phonetics": "[mwa]",
        "tip": "Las vocales 'oi' SIEMPRE se pronuncian 'ua' [wa] en francés.",
        "grammar": "Pronombre tónico 1ra pers.",
        "tef_level": "A1",
        "timestamp": 283,
        "tags": ["pronombres", "fonetica", "regla_oi"]
    },
    {
        "id": "c1_14",
        "french": "toi",
        "spanish": "ti / tú (tónico)",
        "english": "you",
        "phonetics": "[twa]",
        "tip": "Igual que moi: 'oi' -> [wa].",
        "grammar": "Pronombre tónico 2da pers.",
        "tef_level": "A1",
        "timestamp": 303,
        "tags": ["pronombres", "fonetica", "regla_oi"]
    },
    {
        "id": "c1_15",
        "french": "pour",
        "spanish": "para",
        "english": "for",
        "phonetics": "[puʁ]",
        "tip": "Las vocales 'ou' en francés se pronuncian exactamente como la 'u' española [u].",
        "grammar": "Preposición",
        "tef_level": "A1",
        "timestamp": 308,
        "tags": ["preposicion", "fonetica", "regla_ou"]
    },
    {
        "id": "c1_16",
        "french": "pour moi",
        "spanish": "para mí",
        "english": "for me",
        "phonetics": "[puʁ mwa]",
        "tip": "Pronunciación conectada: 'pur-muá'.",
        "grammar": "Preposición + pronombre tónico",
        "tef_level": "A1",
        "timestamp": 327,
        "tags": ["expresiones", "pronombres"]
    },
    {
        "id": "c1_17",
        "french": "pour toi",
        "spanish": "para ti",
        "english": "for you",
        "phonetics": "[puʁ twa]",
        "tip": "Pronunciación: 'pur-tuá'.",
        "grammar": "Preposición + pronombre tónico",
        "tef_level": "A1",
        "timestamp": 339,
        "tags": ["expresiones", "pronombres"]
    },
    {
        "id": "c1_18",
        "french": "C'est pour moi.",
        "spanish": "Es para mí.",
        "english": "It is for me.",
        "phonetics": "[sɛ puʁ mwa]",
        "tip": "Construcción rápida de frase: sujeto 'c'est' + complemento 'pour moi'.",
        "grammar": "Oración básica",
        "tef_level": "A1",
        "timestamp": 346,
        "tags": ["oraciones", "dialogo"]
    },
    {
        "id": "c1_19",
        "french": "C'est important pour moi.",
        "spanish": "Es importante para mí.",
        "english": "It is important for me.",
        "phonetics": "[sɛ.t‿ɛ̃.pɔʁ.tɑ̃ puʁ mwa]",
        "tip": "Recuerda la liaison entre 'c'est' e 'important': [sɛ-tɛ̃-pɔʁ-tɑ̃ pur mwa].",
        "grammar": "C'est + adjetivo + complemento",
        "tef_level": "A1",
        "timestamp": 378,
        "tags": ["oraciones", "liaison", "esencial"]
    },
    {
        "id": "c1_20",
        "french": "vraiment",
        "spanish": "de verdad / realmente",
        "english": "really / truly",
        "phonetics": "[vʁɛ.mɑ̃]",
        "tip": "La 'v' en francés siempre es labiodental /v/ (dientes superiores tocan labio inferior), nunca bilabial como en español. 'ai' -> [ɛ], 'ent' final -> [ɑ̃].",
        "grammar": "Adverbio de grado/intensidad",
        "tef_level": "A1",
        "timestamp": 390,
        "tags": ["adverbio", "fonetica", "diferencia_v_b"]
    },
    {
        "id": "c1_21",
        "french": "C'est vraiment important.",
        "spanish": "De verdad es importante. / Es realmente importante.",
        "english": "It is really important.",
        "phonetics": "[sɛ vʁɛ.mɑ̃.t‿ɛ̃.pɔʁ.tɑ̃]",
        "tip": "El adverbio 'vraiment' se coloca exactamente entre el verbo 'c'est' y el adjetivo 'important'.",
        "grammar": "Posición del adverbio",
        "tef_level": "A1",
        "timestamp": 413,
        "tags": ["oraciones", "adverbio"]
    },
    {
        "id": "c1_22",
        "french": "C'est difficile pour toi.",
        "spanish": "Es difícil para ti.",
        "english": "It is difficult for you.",
        "phonetics": "[sɛ di.fi.sil puʁ twa]",
        "tip": "Frase completa sin silencios bruscos: fluidez continua.",
        "grammar": "Oración afirmativa",
        "tef_level": "A1",
        "timestamp": 439,
        "tags": ["oraciones", "comunicacion"]
    },
    {
        "id": "c1_23",
        "french": "quelque chose",
        "spanish": "algo",
        "english": "something",
        "phonetics": "[kɛl.kə.ʃoz]",
        "tip": "¡CUIDADO! La 'u' después de la 'q' no se pronuncia como en español. Se dice 'kelk-shoz'.",
        "grammar": "Pronombre indefinido",
        "tef_level": "A1",
        "timestamp": 454,
        "tags": ["vocabulario", "pronombres", "fonetica"]
    },
    {
        "id": "c1_24",
        "french": "quelque chose d'important",
        "spanish": "algo importante",
        "english": "something important",
        "phonetics": "[kɛl.kə.ʃoz d‿ɛ̃.pɔʁ.tɑ̃]",
        "tip": "En francés, 'quelque chose' exige la preposición 'de' antes de un adjetivo. Ante vocal, 'de' se elide a 'd''.",
        "grammar": "Estructura quelque chose + de + adjetivo",
        "tef_level": "A1",
        "timestamp": 475,
        "tags": ["gramatica", "elision", "regla_clave"]
    },
    {
        "id": "c1_25",
        "french": "C'est quelque chose d'important pour moi.",
        "spanish": "Es algo importante para mí.",
        "english": "It is something important for me.",
        "phonetics": "[sɛ kɛl.kə.ʃoz d‿ɛ̃.pɔʁ.tɑ̃ puʁ mwa]",
        "tip": "Oración de alta frecuencia en el examen TEF para argumentar opiniones en Speaking Section B.",
        "grammar": "Oración extendida B1/A2 prep",
        "tef_level": "A1",
        "timestamp": 499,
        "tags": ["oraciones", "tef_speaking"]
    },
    {
        "id": "c1_26",
        "french": "Ce n'est pas...",
        "spanish": "No es...",
        "english": "It is not...",
        "phonetics": "[sə nɛ pa]",
        "tip": "La negación estándar en francés envuelve al verbo con 'ne' y 'pas'. Ante vocal 'est', 'ne' se elide a 'n''.",
        "grammar": "Estructura de negación (ne... pas)",
        "tef_level": "A1",
        "timestamp": 515,
        "tags": ["negacion", "gramatica"]
    },
    {
        "id": "c1_27",
        "french": "Ce n'est pas pour moi, c'est pour toi.",
        "spanish": "No es para mí, es para ti.",
        "english": "It is not for me, it is for you.",
        "phonetics": "[sə nɛ pa puʁ mwa, sɛ puʁ twa]",
        "tip": "Contraste negación / afirmación. En lenguaje hablado informal a menudo se omite el 'ne' ('c'est pas pour moi').",
        "grammar": "Oración compuesta / contraste",
        "tef_level": "A1",
        "timestamp": 541,
        "tags": ["oraciones", "negacion", "dialogo"]
    },
    {
        "id": "c1_28",
        "french": "Ce n'est pas important pour moi.",
        "spanish": "No es importante para mí.",
        "english": "It is not important for me.",
        "phonetics": "[sə nɛ pa.z‿ɛ̃.pɔʁ.tɑ̃ puʁ mwa]",
        "tip": "Liaison facultativa con 'pas' + 'important': la 's' suena como 'z' [pa-zɛ̃-pɔʁ-tɑ̃].",
        "grammar": "Negación con liaison",
        "tef_level": "A1",
        "timestamp": 566,
        "tags": ["oraciones", "negacion"]
    },
    {
        "id": "c1_29",
        "french": "aujourd'hui",
        "spanish": "hoy",
        "english": "today",
        "phonetics": "[o.ʒuʁ.dɥi]",
        "tip": "'au' se pronuncia [o]. 'ou' se pronuncia [u]. 'd'hui' tiene el sonido semivocálico [ɥi].",
        "grammar": "Adverbio temporal",
        "tef_level": "A1",
        "timestamp": 582,
        "tags": ["vocabulario", "tiempo", "fonetica"]
    },
    {
        "id": "c1_30",
        "french": "un jour",
        "spanish": "un día",
        "english": "a day",
        "phonetics": "[œ̃ ʒuʁ]",
        "tip": "'j' se pronuncia [ʒ], 'ou' se pronuncia [u].",
        "grammar": "Sustantivo masculino",
        "tef_level": "A1",
        "timestamp": 592,
        "tags": ["vocabulario"]
    },
    {
        "id": "c1_31",
        "french": "Aujourd'hui c'est un jour important pour moi.",
        "spanish": "Hoy es un día importante para mí.",
        "english": "Today is an important day for me.",
        "phonetics": "[o.ʒuʁ.dɥi sɛ.t‿œ̃ ʒuʁ ɛ̃.pɔʁ.tɑ̃ puʁ mwa]",
        "tip": "Frase compleja fluida que combina adverbio temporal, enlace 'c'est un', y calificativo.",
        "grammar": "Oración temporal + predicado",
        "tef_level": "A1",
        "timestamp": 612,
        "tags": ["oraciones", "expresiones", "esencial", "tef_star", "compleja"],
        "is_tef_key": True,
        "is_complex": True
    },
    {
        "id": "c1_32",
        "french": "facile",
        "spanish": "fácil",
        "english": "easy",
        "phonetics": "[fa.sil]",
        "tip": "La 'c' ante 'i' suena como 's' [s]. La 'e' final es muda.",
        "grammar": "Adjetivo invariable m/f",
        "tef_level": "A1",
        "timestamp": 631,
        "tags": ["adjetivo", "fonetica"]
    },
    {
        "id": "c1_33",
        "french": "C'est facile.",
        "spanish": "Es fácil.",
        "english": "It is easy.",
        "phonetics": "[sɛ fa.sil]",
        "tip": "Frase rápida muy usada.",
        "grammar": "C'est + adjetivo",
        "tef_level": "A1",
        "timestamp": 641,
        "tags": ["oraciones"]
    },
    {
        "id": "c1_34",
        "french": "C'est vraiment facile.",
        "spanish": "De verdad es fácil. / Es realmente fácil.",
        "english": "It is really easy.",
        "phonetics": "[sɛ vʁɛ.mɑ̃ fa.sil]",
        "tip": "Uso del intensificador 'vraiment' antes de 'facile'.",
        "grammar": "C'est + adverbio + adjetivo",
        "tef_level": "A1",
        "timestamp": 659,
        "tags": ["oraciones", "adverbio"]
    },
    {
        "id": "c1_35",
        "french": "mais",
        "spanish": "pero",
        "english": "but",
        "phonetics": "[mɛ]",
        "tip": "'ai' se pronuncia [ɛ] abierta, y la 's' final NO se pronuncia jamás.",
        "grammar": "Conjunción coordinante adversativa",
        "tef_level": "A1",
        "timestamp": 670,
        "tags": ["conjuncion", "conectores", "fonetica"]
    },
    {
        "id": "c1_36",
        "french": "C'est difficile mais ce n'est pas impossible, c'est vraiment important pour moi.",
        "spanish": "Es difícil pero no es imposible, de verdad es importante para mí.",
        "english": "It is difficult but it is not impossible, it is really important for me.",
        "phonetics": "[sɛ di.fi.sil mɛ sə nɛ pa.z‿ɛ̃.pɔ.sibl, sɛ vʁɛ.mɑ̃.t‿ɛ̃.pɔʁ.tɑ̃ puʁ mwa]",
        "tip": "🎯 PREGUNTA EXAMEN DE JUDY: La prueba final de la lección 1 para unir todos los elementos aprendidos.",
        "grammar": "Oración compuesta con conectores y negación",
        "tef_level": "A1/A2",
        "timestamp": 688,
        "tags": ["examen_final", "desafio", "oraciones", "clave_curso", "tef_star", "compleja"],
        "is_tef_key": True,
        "is_complex": True
    }
]

COURSE_3_PRECOMPUTED_CARDS = [
    {
        "id": "c3_01",
        "french": "C'est quelque chose de difficile mais c'est très nécessaire de le faire maintenant.",
        "spanish": "Es algo difícil pero es muy necesario hacerlo ahora.",
        "english": "It is something difficult but it is very necessary to do it now.",
        "phonetics": "[sɛ kɛl.kə.ʃoz də di.fi.sil mɛ sɛ tʁɛ ne.sɛ.sɛʁ də lə fɛʁ mɛ̃t.nɑ̃]",
        "tip": "Judy abre la lección 3 repasando el reto final del curso 2 uniendo quelque chose de, conector de contraste mais, y régimen de infinitivo.",
        "grammar": "Oración compuesta compleja con conectores",
        "tef_level": "A1/A2",
        "timestamp": 35,
        "tags": [
            "oraciones",
            "repaso",
            "conectores",
            "tef_star",
            "compleja"
        ],
        "is_tef_key": True,
        "is_complex": True
    },
    {
        "id": "c3_02",
        "french": "le faire",
        "spanish": "hacerlo",
        "english": "to do it",
        "phonetics": "[lə fɛʁ]",
        "tip": "Pronombre objeto directo \"le\" antes del verbo en infinitivo \"faire\". La \"ai\" suena como \"è\" abierta [ɛ].",
        "grammar": "Pronombre objeto + Infinitivo",
        "tef_level": "A1",
        "timestamp": 64,
        "tags": [
            "verbos",
            "infinitivo",
            "pronombres"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_03",
        "french": "J'ai besoin de",
        "spanish": "Necesito (tengo necesidad de)",
        "english": "I need to / I need",
        "phonetics": "[ʒe bə.zwɛ̃ də]",
        "tip": "Estructura clave en francés: \"avoir besoin de\". Judy enfatiza que la preposición \"de\" es obligatoria antes del verbo o sustantivo.",
        "grammar": "Perífrasis verbal de necesidad",
        "tef_level": "A1",
        "timestamp": 74,
        "tags": [
            "perifrasis",
            "esencial",
            "expresiones",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_04",
        "french": "J'ai besoin de le faire.",
        "spanish": "Necesito hacerlo.",
        "english": "I need to do it.",
        "phonetics": "[ʒe bə.zwɛ̃ də lə fɛʁ]",
        "tip": "Enlace de tres palabras cortas: \"de le faire\". Cada \"e\" se pronuncia suave con boca redondeada [ə].",
        "grammar": "Avoir besoin de + infinitivo",
        "tef_level": "A1",
        "timestamp": 83,
        "tags": [
            "oraciones",
            "esencial",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_05",
        "french": "Je n'ai pas besoin de",
        "spanish": "No necesito",
        "english": "I do not need to",
        "phonetics": "[ʒə ne pa bə.zwɛ̃ də]",
        "tip": "Negación alrededor del verbo auxiliar \"ai\": \"ne... pas\". Con la elisión se convierte en \"je n'ai pas\".",
        "grammar": "Negación compuesta (ne ... pas)",
        "tef_level": "A1",
        "timestamp": 90,
        "tags": [
            "negacion",
            "perifrasis"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_06",
        "french": "Je n'ai pas besoin de le faire.",
        "spanish": "No necesito hacerlo.",
        "english": "I do not need to do it.",
        "phonetics": "[ʒə ne pa bə.zwɛ̃ də lə fɛʁ]",
        "tip": "En francés hablado coloquial, los nativos suelen omitir el \"ne\": \"J'ai pas besoin de le faire\".",
        "grammar": "Negación + infinitivo",
        "tef_level": "A1",
        "timestamp": 98,
        "tags": [
            "oraciones",
            "negacion",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_07",
        "french": "être",
        "spanish": "estar / ser",
        "english": "to be",
        "phonetics": "[ɛtʁ]",
        "tip": "La \"e\" final no se pronuncia. El acento circunflejo \"ê\" indica una \"e\" abierta [ɛ].",
        "grammar": "Verbo copulativo en infinitivo",
        "tef_level": "A1",
        "timestamp": 107,
        "tags": [
            "verbos",
            "esencial"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_08",
        "french": "d'être",
        "spanish": "estar (con preposición elidida)",
        "english": "to be (elided)",
        "phonetics": "[d‿ɛtʁ]",
        "tip": "Regla de elisión explicada por Judy: como \"de\" y \"être\" tienen vocales consecutivas, eliminamos la \"e\" de \"de\" y colocamos apóstrofe.",
        "grammar": "Elisión preposicional (de + voyelle)",
        "tef_level": "A1",
        "timestamp": 125,
        "tags": [
            "fonetica",
            "elision",
            "gramatica"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_09",
        "french": "J'ai besoin d'être ici.",
        "spanish": "Necesito estar aquí.",
        "english": "I need to be here.",
        "phonetics": "[ʒe bə.zwɛ̃ d‿ɛ.tʁ‿i.si]",
        "tip": "Doble encadenamiento fluido: \"d'être\" [dɛtʁ] se encadena consonánticamente con \"ici\" [i.si].",
        "grammar": "Avoir besoin de + infinitif + adverbio",
        "tef_level": "A1",
        "timestamp": 136,
        "tags": [
            "oraciones",
            "esencial",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_10",
        "french": "Je n'ai pas besoin d'être ici.",
        "spanish": "No necesito estar aquí.",
        "english": "I do not need to be here.",
        "phonetics": "[ʒə ne pa bə.zwɛ̃ d‿ɛ.tʁ‿i.si]",
        "tip": "Negación completa. Muy útil en situaciones de examen para expresar desacuerdo o límites personales.",
        "grammar": "Negación + régimen infinitivo",
        "tef_level": "A1",
        "timestamp": 161,
        "tags": [
            "oraciones",
            "negacion",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_11",
        "french": "Je n'ai pas besoin d'être ici aujourd'hui.",
        "spanish": "No necesito estar aquí hoy.",
        "english": "I do not need to be here today.",
        "phonetics": "[ʒə ne pa bə.zwɛ̃ d‿ɛ.tʁ‿i.si o.ʒuʁ.dɥi]",
        "tip": "Frase compleja fluida que integra negación, elisión infinitiva y complemento circunstancial temporal.",
        "grammar": "Oración compleja negativa + tiempo",
        "tef_level": "A1",
        "timestamp": 185,
        "tags": [
            "oraciones",
            "negacion",
            "tef_star",
            "compleja"
        ],
        "is_tef_key": True,
        "is_complex": True
    },
    {
        "id": "c3_12",
        "french": "maintenant",
        "spanish": "ahora",
        "english": "now",
        "phonetics": "[mɛ̃t.nɑ̃]",
        "tip": "Pronunciación nativa: la \"e\" central es casi muda (\"mèn-tnan\"), terminando con nasal [ɑ̃]. La \"t\" final no suena.",
        "grammar": "Adverbio de tiempo",
        "tef_level": "A1",
        "timestamp": 206,
        "tags": [
            "adverbios",
            "tiempo",
            "fonetica"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_13",
        "french": "J'ai besoin de le faire maintenant.",
        "spanish": "Necesito hacerlo ahora.",
        "english": "I need to do it now.",
        "phonetics": "[ʒe bə.zwɛ̃ də lə fɛʁ mɛ̃t.nɑ̃]",
        "tip": "Oración de urgencia cotidiana de alta frecuencia.",
        "grammar": "Avoir besoin de + infinitivo + adverbio",
        "tef_level": "A1",
        "timestamp": 219,
        "tags": [
            "oraciones",
            "esencial",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_14",
        "french": "J'ai besoin d'être ici maintenant.",
        "spanish": "Necesito estar aquí ahora.",
        "english": "I need to be here now.",
        "phonetics": "[ʒe bə.zwɛ̃ d‿ɛ.tʁ‿i.si mɛ̃t.nɑ̃]",
        "tip": "Unión de elisión (\"d'être\"), localización (\"ici\") y momento presente (\"maintenant\").",
        "grammar": "Avoir besoin de + infinitif + deícticos",
        "tef_level": "A1",
        "timestamp": 236,
        "tags": [
            "oraciones",
            "esencial",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_15",
        "french": "parce que",
        "spanish": "porque",
        "english": "because",
        "phonetics": "[paʁs kə]",
        "tip": "Conector causal rey del examen TEF. Judy pide repetir: \"parce que\". La \"ce\" se funde en un solo sonido [paʁskə].",
        "grammar": "Conjunción causal subordinante",
        "tef_level": "A1",
        "timestamp": 247,
        "tags": [
            "conectores",
            "causa",
            "esencial",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_16",
        "french": "parce que c'est important",
        "spanish": "porque es importante",
        "english": "because it is important",
        "phonetics": "[paʁs kə sɛ.t‿ɛ̃.pɔʁ.tɑ̃]",
        "tip": "Liaison obligatoria [t] entre \"c'est\" y la vocal nasal de \"important\" [sɛ.t‿ɛ̃.pɔʁ.tɑ̃].",
        "grammar": "Subordinada causal explicativa",
        "tef_level": "A1",
        "timestamp": 266,
        "tags": [
            "conectores",
            "liaison",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_17",
        "french": "parce que c'est très important",
        "spanish": "porque es muy importante",
        "english": "because it is very important",
        "phonetics": "[paʁs kə sɛ tʁɛ.z‿ɛ̃.pɔʁ.tɑ̃]",
        "tip": "Liaison obligatoria sonora [z] entre \"très\" y la vocal nasal de \"important\" [tʁɛ.z‿ɛ̃.pɔʁ.tɑ̃].",
        "grammar": "Subordinada causal intensificada",
        "tef_level": "A1",
        "timestamp": 279,
        "tags": [
            "conectores",
            "liaison",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_18",
        "french": "J'ai besoin de le faire aujourd'hui parce que c'est important.",
        "spanish": "Necesito hacerlo hoy porque es importante.",
        "english": "I need to do it today because it is important.",
        "phonetics": "[ʒe bə.zwɛ̃ də lə fɛʁ o.ʒuʁ.dɥi paʁs kə sɛ.t‿ɛ̃.pɔʁ.tɑ̃]",
        "tip": "Frase compuesta fluida que combina necesidad + acción + tiempo + justificación causal. Liaison [t] en \"c'est‿important\".",
        "grammar": "Oración compuesta compleja con subordinada causal",
        "tef_level": "A1/A2",
        "timestamp": 309,
        "tags": [
            "oraciones",
            "argumentacion",
            "tef_star",
            "compleja"
        ],
        "is_tef_key": True,
        "is_complex": True
    },
    {
        "id": "c3_19",
        "french": "J'ai besoin d'être ici aujourd'hui parce que c'est important.",
        "spanish": "Necesito estar aquí hoy porque es importante.",
        "english": "I need to be here today because it is important.",
        "phonetics": "[ʒe bə.zwɛ̃ d‿ɛ.tʁ‿i.si o.ʒuʁ.dɥi paʁs kə sɛ.t‿ɛ̃.pɔʁ.tɑ̃]",
        "tip": "Variación de alta fluidez combinando elisión \"d'être ici\" con justificación causal \"parce que c'est‿important\".",
        "grammar": "Oración compuesta compleja con subordinada causal",
        "tef_level": "A1/A2",
        "timestamp": 334,
        "tags": [
            "oraciones",
            "argumentacion",
            "tef_star",
            "compleja"
        ],
        "is_tef_key": True,
        "is_complex": True
    },
    {
        "id": "c3_20",
        "french": "possible",
        "spanish": "posible",
        "english": "possible",
        "phonetics": "[pɔ.sibl]",
        "tip": "Cognado directo. La \"o\" es abierta [ɔ] y la \"e\" final es muda.",
        "grammar": "Adjetivo calificativo",
        "tef_level": "A1",
        "timestamp": 354,
        "tags": [
            "adjetivos",
            "cognados"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_21",
        "french": "impossible",
        "spanish": "imposible",
        "english": "impossible",
        "phonetics": "[ɛ̃.pɔ.sibl]",
        "tip": "La \"im\" inicial es una vocal nasal [ɛ̃], exactamente igual que en \"important\".",
        "grammar": "Adjetivo calificativo antonímico",
        "tef_level": "A1",
        "timestamp": 350,
        "tags": [
            "adjetivos",
            "cognados",
            "fonetica"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_22",
        "french": "C'est possible.",
        "spanish": "Es posible.",
        "english": "It is possible.",
        "phonetics": "[sɛ pɔ.sibl]",
        "tip": "Frase afirmativa de valoración y disponibilidad.",
        "grammar": "C'est + adjetivo",
        "tef_level": "A1",
        "timestamp": 361,
        "tags": [
            "expresiones",
            "oraciones"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_23",
        "french": "Ce n'est pas possible.",
        "spanish": "No es posible.",
        "english": "It is not possible.",
        "phonetics": "[sə ne pa pɔ.sibl]",
        "tip": "Negación estándar con \"ce n'est pas\". En habla oral coloquial suele decirse \"c'est pas possible\" [sɛ pa pɔsibl].",
        "grammar": "Negación predicativa",
        "tef_level": "A1",
        "timestamp": 369,
        "tags": [
            "oraciones",
            "negacion",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_24",
        "french": "Maintenant ce n'est pas possible.",
        "spanish": "Ahora no es posible.",
        "english": "Now it is not possible.",
        "phonetics": "[mɛ̃t.nɑ̃ sə ne pa pɔ.sibl]",
        "tip": "Adverbio temporal al inicio que da tono asertivo y natural a la respuesta.",
        "grammar": "Adverbio + oración negativa",
        "tef_level": "A1",
        "timestamp": 380,
        "tags": [
            "oraciones",
            "comunicacion",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_25",
        "french": "savoir",
        "spanish": "saber",
        "english": "to know",
        "phonetics": "[sa.vwaʁ]",
        "tip": "Verbo en infinitivo de tercer grupo. El diptongo \"oi\" se pronuncia como [wa].",
        "grammar": "Verbo transitivo en infinitivo",
        "tef_level": "A1",
        "timestamp": 395,
        "tags": [
            "verbos",
            "esencial"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_26",
        "french": "J'ai besoin de savoir",
        "spanish": "Necesito saber",
        "english": "I need to know",
        "phonetics": "[ʒe bə.zwɛ̃ də sa.vwaʁ]",
        "tip": "La fórmula reina para iniciar preguntas formales en el examen TEF (Speaking Sección A - Demande d'informations).",
        "grammar": "Perífrasis de necesidad + infinitivo",
        "tef_level": "A1",
        "timestamp": 411,
        "tags": [
            "expresiones",
            "comunicacion",
            "tef_speaking",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_27",
        "french": "si",
        "spanish": "si (condicional / duda)",
        "english": "if / whether",
        "phonetics": "[si]",
        "tip": "Judy explica que el \"si\" condicional o interrogativo indirecto se pronuncia como una [i] clara y cerrada.",
        "grammar": "Conjunción subordinante interrogativa indirecta",
        "tef_level": "A1",
        "timestamp": 423,
        "tags": [
            "conectores",
            "condicion"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_28",
        "french": "si c'est possible",
        "spanish": "si es posible",
        "english": "if it is possible",
        "phonetics": "[si sɛ pɔ.sibl]",
        "tip": "Fórmula de cortesía interrogativa indirecta para consultas presenciales o telefónicas.",
        "grammar": "Cláusula condicional subordinada",
        "tef_level": "A1",
        "timestamp": 447,
        "tags": [
            "cortesia",
            "expresiones",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_29",
        "french": "si c'est possible pour moi",
        "spanish": "si es posible para mí",
        "english": "if it is possible for me",
        "phonetics": "[si sɛ pɔ.sibl puʁ mwa]",
        "tip": "Agrega el pronombre tónico \"pour moi\" al final para personalizar la consulta.",
        "grammar": "Cláusula condicional + sintagma preposicional",
        "tef_level": "A1",
        "timestamp": 459,
        "tags": [
            "cortesia",
            "expresiones",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_30",
        "french": "J'ai besoin de savoir si c'est possible.",
        "spanish": "Necesito saber si es posible.",
        "english": "I need to know if it is possible.",
        "phonetics": "[ʒe bə.zwɛ̃ də sa.vwaʁ si sɛ pɔ.sibl]",
        "tip": "Oración compuesta fluida indispensable para el diálogo de rol formal en TEF Speaking Sección A.",
        "grammar": "Oración compleja subordinada sustantiva",
        "tef_level": "A1/A2",
        "timestamp": 472,
        "tags": [
            "oraciones",
            "tef_speaking",
            "tef_star",
            "compleja"
        ],
        "is_tef_key": True,
        "is_complex": True
    },
    {
        "id": "c3_31",
        "french": "J'ai besoin de savoir si c'est possible aujourd'hui.",
        "spanish": "Necesito saber si es posible hoy.",
        "english": "I need to know if it is possible today.",
        "phonetics": "[ʒe bə.zwɛ̃ də sa.vwaʁ si sɛ pɔ.sibl o.ʒuʁ.dɥi]",
        "tip": "Oración con precisión de tiempo para solicitar citas o confirmar disponibilidad.",
        "grammar": "Oración compleja subordinada + adverbio temporal",
        "tef_level": "A1/A2",
        "timestamp": 498,
        "tags": [
            "oraciones",
            "tef_speaking",
            "tef_star",
            "compleja"
        ],
        "is_tef_key": True,
        "is_complex": True
    },
    {
        "id": "c3_32",
        "french": "de le faire",
        "spanish": "hacerlo (con régimen preposicional)",
        "english": "to do it (with preposition)",
        "phonetics": "[də lə fɛʁ]",
        "tip": "En francés, \"c'est possible\" rige la preposición \"de\" antes de cualquier verbo en infinitivo.",
        "grammar": "Régimen preposicional de infinitivo",
        "tef_level": "A1",
        "timestamp": 521,
        "tags": [
            "gramatica",
            "regimen_preposicional"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_33",
        "french": "J'ai besoin de savoir si c'est possible de le faire aujourd'hui.",
        "spanish": "Necesito saber si es posible hacerlo hoy.",
        "english": "I need to know if it is possible to do it today.",
        "phonetics": "[ʒe bə.zwɛ̃ də sa.vwaʁ si sɛ pɔ.sibl də lə fɛʁ o.ʒuʁ.dɥi]",
        "tip": "Estructura multicapa: Necesidad (\"j'ai besoin\") + Consulta (\"de savoir\") + Condicional (\"si c'est possible\") + Régimen (\"de le faire\") + Tiempo (\"aujourd'hui\").",
        "grammar": "Oración compleja subordinada múltiple",
        "tef_level": "A2",
        "timestamp": 526,
        "tags": [
            "oraciones",
            "tef_speaking",
            "tef_star",
            "compleja"
        ],
        "is_tef_key": True,
        "is_complex": True
    },
    {
        "id": "c3_34",
        "french": "J'ai besoin de savoir si c'est possible de le faire maintenant parce que c'est très important.",
        "spanish": "Necesito saber si es posible hacerlo ahora porque es muy importante.",
        "english": "I need to know if it is possible to do it now because it is very important.",
        "phonetics": "[ʒe bə.zwɛ̃ də sa.vwaʁ si sɛ pɔ.sibl də lə fɛʁ mɛ̃t.nɑ̃ paʁs kə sɛ tʁɛ.z‿ɛ̃.pɔʁ.tɑ̃]",
        "tip": "🏆 CUMBRE DEL CURSO 3: Frase de nivel B1 que une 4 cláusulas fluidas. Liaison sonora [z] en \"très‿important\".",
        "grammar": "Oración compuesta subordinada causal compleja",
        "tef_level": "A2/B1",
        "timestamp": 560,
        "tags": [
            "oraciones",
            "argumentacion",
            "tef_star",
            "compleja"
        ],
        "is_tef_key": True,
        "is_complex": True
    },
    {
        "id": "c3_35",
        "french": "quelque chose",
        "spanish": "algo",
        "english": "something",
        "phonetics": "[kɛl.kə ʃoz]",
        "tip": "Pronunciación: \"quelque\" [kɛlkə] + \"chose\" [ʃoz]. La \"s\" final es sonora [z]. Siempre rige \"de/d'\" ante adjetivos.",
        "grammar": "Pronombre indefinido",
        "tef_level": "A1",
        "timestamp": 580,
        "tags": [
            "vocabulario",
            "esencial"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_36",
        "french": "quelque chose d'important",
        "spanish": "algo importante",
        "english": "something important",
        "phonetics": "[kɛl.kə ʃoz d‿ɛ̃.pɔʁ.tɑ̃]",
        "tip": "Régimen preposicional obligatorio: \"quelque chose\" exige \"de\" (elidido en \"d'\") antes del adjetivo calificativo.",
        "grammar": "Pronombre indefinido + preposición + adjetivo",
        "tef_level": "A1",
        "timestamp": 598,
        "tags": [
            "expresiones",
            "gramatica",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_37",
        "french": "J'ai besoin de savoir si c'est quelque chose d'important.",
        "spanish": "Necesito saber si es algo importante.",
        "english": "I need to know if it is something important.",
        "phonetics": "[ʒe bə.zwɛ̃ də sa.vwaʁ si sɛ kɛl.kə ʃoz d‿ɛ̃.pɔʁ.tɑ̃]",
        "tip": "Estructura sofisticada para pedir clarificación o prioridad sobre un asunto en el trabajo o vida diaria.",
        "grammar": "Oración compleja subordinada sustantiva",
        "tef_level": "A2",
        "timestamp": 604,
        "tags": [
            "oraciones",
            "comunicacion",
            "tef_star",
            "compleja"
        ],
        "is_tef_key": True,
        "is_complex": True
    },
    {
        "id": "c3_38",
        "french": "vouloir",
        "spanish": "querer",
        "english": "to want",
        "phonetics": "[vu.lwaʁ]",
        "tip": "Verbo modal de tercer grupo indispensable para expresar deseos, peticiones y voluntad.",
        "grammar": "Verbo modal en infinitivo",
        "tef_level": "A1",
        "timestamp": 624,
        "tags": [
            "verbos",
            "modales",
            "esencial"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_39",
        "french": "Je veux",
        "spanish": "Quiero",
        "english": "I want",
        "phonetics": "[ʒə vø]",
        "tip": "La \"x\" final es muda. La combinación \"eu\" produce el sonido labial cerrado francés [ø].",
        "grammar": "Presente de indicativo (1ª persona singular)",
        "tef_level": "A1",
        "timestamp": 630,
        "tags": [
            "verbos",
            "modales",
            "esencial"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_40",
        "french": "Je veux le faire.",
        "spanish": "Quiero hacerlo.",
        "english": "I want to do it.",
        "phonetics": "[ʒə vø lə fɛʁ]",
        "tip": "Pronunciación rítmica de 4 sílabas limpias: \"zhe-vö-le-fèr\".",
        "grammar": "Verbo modal + pronombre + infinitivo",
        "tef_level": "A1",
        "timestamp": 652,
        "tags": [
            "oraciones",
            "esencial",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_41",
        "french": "Je veux le faire aujourd'hui.",
        "spanish": "Quiero hacerlo hoy.",
        "english": "I want to do it today.",
        "phonetics": "[ʒə vø lə fɛʁ o.ʒuʁ.dɥi]",
        "tip": "Expresión de intención y voluntad directa para conversaciones diarias.",
        "grammar": "Modal + infinitivo + adverbio temporal",
        "tef_level": "A1",
        "timestamp": 665,
        "tags": [
            "oraciones",
            "esencial",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_42",
        "french": "Je ne veux pas",
        "spanish": "No quiero",
        "english": "I do not want",
        "phonetics": "[ʒə nə vø pa]",
        "tip": "Negación formal. La \"s\" de \"pas\" es muda. En el habla oral informal se escucha \"Je veux pas\" [ʒvøpa].",
        "grammar": "Negación regular de presente",
        "tef_level": "A1",
        "timestamp": 677,
        "tags": [
            "negacion",
            "verbos"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_43",
        "french": "comme ça",
        "spanish": "así / de esta manera",
        "english": "like that / this way",
        "phonetics": "[kɔm sa]",
        "tip": "La \"ç\" con cedilla se pronuncia como \"s\" sorda [s]. La \"e\" de \"comme\" se apocopa ante consonante.",
        "grammar": "Locución adverbial de modo",
        "tef_level": "A1",
        "timestamp": 696,
        "tags": [
            "expresiones",
            "adverbios"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_44",
        "french": "Je ne veux pas le faire comme ça.",
        "spanish": "No quiero hacerlo así.",
        "english": "I do not want to do it like that.",
        "phonetics": "[ʒə nə vø pa lə fɛʁ kɔm sa]",
        "tip": "Fórmula cortés y asertiva para rechazar una propuesta o indicar una preferencia distinta.",
        "grammar": "Negación modal + objeto + locución de modo",
        "tef_level": "A1/A2",
        "timestamp": 711,
        "tags": [
            "oraciones",
            "asertividad",
            "tef_star"
        ],
        "is_tef_key": True,
        "is_complex": False
    },
    {
        "id": "c3_45",
        "french": "Je veux pas le faire comme ça.",
        "spanish": "No quiero hacerlo así (francés oral coloquial).",
        "english": "I don't want to do it like that (spoken French).",
        "phonetics": "[ʒvø pa lə fɛʁ kɔm sa]",
        "tip": "Judy resalta explícitamente cómo hablan los franceses nativos en la calle, elidiendo el \"ne\" y contrayendo \"je veux\".",
        "grammar": "Registro oral coloquial (omisión de \"ne\")",
        "tef_level": "A1/A2",
        "timestamp": 721,
        "tags": [
            "oral",
            "coloquial",
            "fluidez"
        ],
        "is_tef_key": False,
        "is_complex": False
    },
    {
        "id": "c3_46",
        "french": "Je veux savoir si c'est facile pour moi de le faire.",
        "spanish": "Quiero saber si es fácil para mí hacerlo.",
        "english": "I want to know if it is easy for me to do it.",
        "phonetics": "[ʒə vø sa.vwaʁ si sɛ fa.sil puʁ mwa də lə fɛʁ]",
        "tip": "🎯 PREGUNTA EXAMEN DE JUDY (CURSO 3): La prueba final de la lección para unir \"vouloir + savoir + si + c'est facile pour moi + de le faire\". ¡Escríbela en los comentarios!",
        "grammar": "Oración compleja compuesta con interrogativa indirecta e infinitivo",
        "tef_level": "A2",
        "timestamp": 735,
        "tags": [
            "examen_final",
            "desafio",
            "oraciones",
            "clave_curso",
            "tef_star",
            "compleja"
        ],
        "is_tef_key": True,
        "is_complex": True
    }
]

def load_decks():
    if not os.path.exists(DECKS_FILE):
        decks = {
            "XUKt0Uqireo": {
                "id": "XUKt0Uqireo",
                "video_id": "XUKt0Uqireo",
                "title": "FRANCÉS desde cero fácil y rápido | Formar oraciones en francés - Curso 1",
                "channel": "Aprender francés con Judy",
                "playlist_id": "PLj0g_C56bhRkMhBschCdIRd_bJfD2nBgG",
                "playlist_title": "Aprender francés con Judy - Curso Completo",
                "duration": 721,
                "lesson_number": 1,
                "tef_level": "A1 (Débutant)",
                "description": "Curso completo de francés para principiantes. Metodología de Judy para construir frases desde cero sin reglas gramaticales complejas.",
                "thumbnail": "https://img.youtube.com/vi/XUKt0Uqireo/maxresdefault.jpg",
                "cards": COURSE_1_PRECOMPUTED_CARDS
            }
        }
        save_decks(decks)
        return decks
    try:
        with open(DECKS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_decks(decks):
    tmp = DECKS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(decks, f, indent=2, ensure_ascii=False)
    os.replace(tmp, DECKS_FILE)

def fetch_playlist_videos(playlist_url=PLAYLIST_URL):
    if os.path.exists(PLAYLIST_FILE):
        try:
            with open(PLAYLIST_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
                if cached and len(cached) > 0:
                    return cached
        except Exception:
            pass

    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--print", "%(id)s\t%(title)s\t%(duration)s",
        playlist_url
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
        videos = []
        if res.returncode == 0:
            lines = res.stdout.strip().split("\n")
            for idx, line in enumerate(lines, 1):
                if "\t" in line:
                    parts = line.split("\t")
                    vid = parts[0].strip()
                    title = parts[1].strip() if len(parts) > 1 else f"Course {idx}"
                    dur = parts[2].strip() if len(parts) > 2 and parts[2].strip() != "NA" else "12:00"
                    videos.append({
                        "lesson_number": idx,
                        "video_id": vid,
                        "title": title,
                        "url": f"https://www.youtube.com/watch?v={vid}&list=PLj0g_C56bhRkMhBschCdIRd_bJfD2nBgG",
                        "thumbnail": f"https://img.youtube.com/vi/{vid}/mqdefault.jpg",
                        "duration_str": dur
                    })
        if videos:
            with open(PLAYLIST_FILE, "w", encoding="utf-8") as f:
                json.dump(videos, f, indent=2, ensure_ascii=False)
            return videos
    except Exception as e:
        print(f"Error fetching playlist videos: {e}")
    return []

def extract_video_id(url_or_id):
    if len(url_or_id) == 11 and not ("/" in url_or_id or "?" in url_or_id):
        return url_or_id
    parsed = urllib.parse.urlparse(url_or_id)
    if "youtube.com" in parsed.netloc:
        qs = urllib.parse.parse_qs(parsed.query)
        if "v" in qs:
            return qs["v"][0]
    elif "youtu.be" in parsed.netloc:
        return parsed.path.lstrip("/").split("?")[0]
    return url_or_id

def generate_flashcards_for_video(video_url_or_id):
    vid = extract_video_id(video_url_or_id)
    decks = load_decks()
    if vid in decks:
        return decks[vid]

    # If it is course 1
    if vid == "XUKt0Uqireo":
        decks[vid] = {
            "id": vid,
            "video_id": vid,
            "title": "FRANCÉS desde cero fácil y rápido | Formar oraciones en francés - Curso 1",
            "channel": "Aprender francés con Judy",
            "playlist_id": "PLj0g_C56bhRkMhBschCdIRd_bJfD2nBgG",
            "duration": 721,
            "lesson_number": 1,
            "tef_level": "A1 (Débutant)",
            "thumbnail": f"https://img.youtube.com/vi/{vid}/maxresdefault.jpg",
            "cards": COURSE_1_PRECOMPUTED_CARDS
        }
        save_decks(decks)
        return decks[vid]

    # Fetch metadata using yt-dlp
    cmd_meta = [
        "yt-dlp",
        "--dump-json",
        f"https://www.youtube.com/watch?v={vid}"
    ]
    try:
        proc = subprocess.run(cmd_meta, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=25)
        if proc.returncode != 0:
            raise RuntimeError(f"yt-dlp error: {proc.stderr}")
        meta = json.loads(proc.stdout)
    except Exception as e:
        # Fallback minimal metadata
        meta = {
            "id": vid,
            "title": f"French Lesson with Judy ({vid})",
            "channel": "Aprender francés con Judy",
            "duration": 700
        }

    # Fetch subtitles (Spanish / French / English)
    sub_file = f"/tmp/{vid}_sub"
    subprocess.run([
        "yt-dlp",
        "--write-auto-sub",
        "--sub-lang", "es,en,fr",
        "--skip-download",
        "-o", sub_file,
        f"https://www.youtube.com/watch?v={vid}"
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=25)

    vtt_path = None
    for lang in ["es", "en", "fr"]:
        candidate = f"{sub_file}.{lang}.vtt"
        if os.path.exists(candidate) and os.path.getsize(candidate) > 200:
            vtt_path = candidate
            break

    cards = []
    if vtt_path and os.path.exists(vtt_path):
        cards = parse_transcript_to_cards(vtt_path, vid)

    if not cards:
        # Generate default template cards based on video title & pattern
        cards = [
            {
                "id": f"{vid}_01",
                "french": "Bonjour tout le monde",
                "spanish": "Hola a todos",
                "english": "Hello everyone",
                "phonetics": "[bɔ̃.ʒuʁ tu lə mɔ̃d]",
                "tip": "Saludo introductorio de Judy al iniciar cada curso.",
                "grammar": "Fórmula de cortesía",
                "tef_level": "A1",
                "timestamp": 10,
                "tags": ["saludos", "introduccion"]
            }
        ]

    deck = {
        "id": vid,
        "video_id": vid,
        "title": meta.get("title", f"French Lesson ({vid})"),
        "channel": meta.get("uploader", "Aprender francés con Judy"),
        "playlist_id": "PLj0g_C56bhRkMhBschCdIRd_bJfD2nBgG",
        "duration": meta.get("duration", 700),
        "lesson_number": 2,
        "tef_level": "A1",
        "thumbnail": f"https://img.youtube.com/vi/{vid}/maxresdefault.jpg",
        "cards": cards
    }
    decks[vid] = deck
    save_decks(decks)
    return deck

def parse_transcript_to_cards(vtt_path, video_id):
    cards = []
    try:
        with open(vtt_path, "r", encoding="utf-8") as f:
            content = f.read()

        cues = re.findall(r'(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3}).*?\n(.*?)(?=\n\n|\Z)', content, re.DOTALL)
        segments = []
        for start_str, end_str, raw_text in cues:
            clean = re.sub(r'<[^>]+>', '', raw_text).strip()
            clean = re.sub(r'\[.*?\]', '', clean).strip()
            lines = [l.strip() for l in clean.split('\n') if l.strip()]
            line_text = ' '.join(lines)
            if line_text:
                # convert start to seconds
                parts = start_str.split(":")
                secs = int(parts[0])*3600 + int(parts[1])*60 + float(parts[2])
                segments.append((secs, line_text))

        # Look for teaching cues like "¿cómo se dice en francés?", "es en francés", etc.
        card_id = 1
        seen_texts = set()
        for idx, (secs, text) in enumerate(segments):
            text_lower = text.lower()
            if any(marker in text_lower for marker in ["cómo se dice", "como se dice", "en francés", "en francais", "pour", "c'est", "répéter"]):
                # Grab surrounding 2-3 cues to synthesize card
                context = " ".join([seg[1] for seg in segments[max(0, idx-1):min(len(segments), idx+3)]])
                if len(context) > 15 and context not in seen_texts:
                    seen_texts.add(context)
                    cards.append({
                        "id": f"{video_id}_{card_id:02d}",
                        "french": f"Expression Lesson {card_id}",
                        "spanish": text,
                        "english": "Translation / Target Phrase",
                        "phonetics": "[fonetique]",
                        "tip": f"Segmento de práctica de Judy en el minuto {int(secs//60)}:{int(secs%60):02d}",
                        "grammar": "Estructura verbal",
                        "tef_level": "A1",
                        "timestamp": int(secs),
                        "tags": ["oraciones", "practica"]
                    })
                    card_id += 1
                    if len(cards) >= 25:
                        break
    except Exception as e:
        print(f"Error parsing VTT transcript: {e}")
    return cards
