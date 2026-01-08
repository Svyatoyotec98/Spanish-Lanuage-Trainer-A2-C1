# Инструкция по добавлению Verbos в новые Unidades

## Обзор системы

Система Verbos позволяет тренировать спряжение глаголов по временам. Каждый глагол проверяется по 6 формам (yo, tú, él, nosotros, vosotros, ellos). Глагол считается "освоенным" только при 100% правильных ответов (все 6 форм).

### Ключевые особенности:
- **Визуальный таймер** - полоска меняет цвет (зелёный → жёлтый → оранжевый → красный)
- **Прогресс от банка** - считается % освоенных глаголов от общего количества
- **Непрерывное тестирование** - тест продолжается пока все глаголы не освоены
- **Разблокировка** - времена разблокируются после прохождения "Проверь себя" (microtest) в Ejercicios

---

## Шаг 1: Структура JSON

В файле `data/UnidadX.json` добавь секцию `verbos` на том же уровне, что `groups` и `ejercicios`:

```json
{
  "groups": { ... },
  "ejercicios": [ ... ],
  "verbos": {
    "tiempos": [
      {
        "id": "presente",
        "nombre": "Presente de indicativo",
        "requiredEjercicio": "ej1",
        "regulares": [ ... ],
        "irregulares": [ ... ],
        "otras": [ ... ]
      }
    ]
  }
}
```

### Поля tiempo:

| Поле | Описание |
|------|----------|
| `id` | Уникальный идентификатор времени (например: `presente`, `pasado_simple`, `futuro`) |
| `nombre` | Отображаемое название на испанском |
| `requiredEjercicio` | ID ejercicio, microtest которого разблокирует это время |
| `regulares` | Массив правильных глаголов |
| `irregulares` | Массив неправильных глаголов |
| `otras` | Массив подкатегорий (reflexivos, etc.) |

---

## Шаг 2: Структура глагола

### Обычный глагол (regulares/irregulares):

```json
{
  "infinitivo": "hablar",
  "traduccion": "говорить",
  "formas": {
    "yo": "hablo",
    "tu": "hablas",
    "el": "habla",
    "nosotros": "hablamos",
    "vosotros": "habláis",
    "ellos": "hablan"
  }
}
```

### Важно:
- `tu` пишется БЕЗ ударения в ключе (но с ударением в значении если нужно)
- `el` - это ключ для "él/ella/usted"
- Все формы в нижнем регистре

---

## Шаг 3: Структура подкатегорий (otras)

Секция `otras` содержит массив подкатегорий, каждая со своим списком глаголов:

```json
"otras": [
  {
    "id": "reflexivos",
    "nombre": "Verbos reflexivos",
    "verbos": [
      {
        "infinitivo": "levantarse",
        "traduccion": "вставать",
        "formas": {
          "yo": "me levanto",
          "tu": "te levantas",
          "el": "se levanta",
          "nosotros": "nos levantamos",
          "vosotros": "os levantáis",
          "ellos": "se levantan"
        }
      }
    ]
  },
  {
    "id": "con_preposicion",
    "nombre": "Verbos con preposición",
    "verbos": [ ... ]
  }
]
```

---

## Шаг 4: Привязка к Ejercicios (разблокировка)

Времена разблокируются через `requiredEjercicio`. Система проверяет:

```javascript
profile.microTestsCompleted[unidadId][ejercicioId] === true
```

### Пример:
- `requiredEjercicio: "ej1"` → нужно пройти "Проверь себя" в ejercicio с id="ej1"
- Проверка глобальная - можно разблокировать время в Unidad 2, пройдя ejercicio в Unidad 1

### Логика в коде (`isVerbosTimeUnlocked`):
```javascript
// Ищет requiredEjercicio во ВСЕХ unidades
for (const unidadId of unidadIds) {
    if (profile.microTestsCompleted?.[unidadId]?.[requiredEjercicio]) {
        return true;
    }
}
```

---

## Шаг 5: Пример полной структуры

```json
{
  "groups": { ... },
  "ejercicios": [
    {
      "id": "ej1",
      "titulo": "Presente de indicativo",
      "questions": [ ... ]
    }
  ],
  "verbos": {
    "tiempos": [
      {
        "id": "presente",
        "nombre": "Presente de indicativo",
        "requiredEjercicio": "ej1",
        "regulares": [
          {
            "infinitivo": "hablar",
            "traduccion": "говорить",
            "formas": {
              "yo": "hablo",
              "tu": "hablas",
              "el": "habla",
              "nosotros": "hablamos",
              "vosotros": "habláis",
              "ellos": "hablan"
            }
          },
          {
            "infinitivo": "comer",
            "traduccion": "есть",
            "formas": {
              "yo": "como",
              "tu": "comes",
              "el": "come",
              "nosotros": "comemos",
              "vosotros": "coméis",
              "ellos": "comen"
            }
          }
        ],
        "irregulares": [
          {
            "infinitivo": "ser",
            "traduccion": "быть",
            "formas": {
              "yo": "soy",
              "tu": "eres",
              "el": "es",
              "nosotros": "somos",
              "vosotros": "sois",
              "ellos": "son"
            }
          }
        ],
        "otras": [
          {
            "id": "reflexivos",
            "nombre": "Verbos reflexivos",
            "verbos": [
              {
                "infinitivo": "llamarse",
                "traduccion": "называться",
                "formas": {
                  "yo": "me llamo",
                  "tu": "te llamas",
                  "el": "se llama",
                  "nosotros": "nos llamamos",
                  "vosotros": "os llamáis",
                  "ellos": "se llaman"
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

## Шаг 6: Чек-лист для новой Unidad

- [ ] Добавить секцию `verbos` в JSON файл
- [ ] Для каждого tiempo указать:
  - [ ] `id` - уникальный идентификатор
  - [ ] `nombre` - название на испанском
  - [ ] `requiredEjercicio` - ID ejercicio для разблокировки
  - [ ] `regulares` - массив правильных глаголов
  - [ ] `irregulares` - массив неправильных глаголов
  - [ ] `otras` - массив подкатегорий (опционально)
- [ ] Проверить что ejercicio с указанным ID существует
- [ ] Убедиться что все глаголы имеют все 6 форм

---

## Как работает прогресс

### Формула для категории (regulares/irregulares):
```
Прогресс = (количество освоенных глаголов / общее количество) × 100%
```

### Формула для tiempo:
```
Прогресс tiempo = (regulares% + irregulares% + otras%) / 3
```

### Формула для Verbos в Unidad:
```
Прогресс Verbos = среднее по всем разблокированным tiempos
```

### Формула для разблокировки экзамена:
```
(Palabras% + Ejercicios% + Verbos%) / 3 >= 80%
```

---

## Хранение прогресса

Прогресс сохраняется в `localStorage` в структуре:

```javascript
profile.progress[unidadId].verbos[tiempoId] = {
  regulares: {
    score: 20,           // % освоенных
    mastered: ["hablar", "comer"]  // список освоенных infinitivos
  },
  irregulares: {
    score: 0,
    mastered: []
  },
  otras: {
    reflexivos: {
      score: 50,
      mastered: ["levantarse"]
    }
  }
}
```

---

## Возможные времена для добавления

| ID | Nombre | Ejemplo |
|----|--------|---------|
| `presente` | Presente de indicativo | hablo |
| `preterito_indefinido` | Pretérito indefinido | hablé |
| `preterito_imperfecto` | Pretérito imperfecto | hablaba |
| `futuro_simple` | Futuro simple | hablaré |
| `condicional` | Condicional simple | hablaría |
| `presente_subjuntivo` | Presente de subjuntivo | hable |
| `imperativo` | Imperativo | habla/hable |

---

## Troubleshooting

### "Нет глаголов в категории"
- Проверь что JSON загружен (hard refresh: Ctrl+Shift+R)
- Проверь структуру: `verbos.tiempos[].regulares`

### Tiempo заблокировано
- Проверь что `requiredEjercicio` указывает на существующий ejercicio
- Пройди "Проверь себя" (microtest) в этом ejercicio

### Прогресс не сохраняется
- Проверь консоль на ошибки
- Должно быть сообщение: `Verbos progress updated: UnidadX/tiempo/category = X%`

---

## Файлы системы

| Файл | Описание |
|------|----------|
| `js/app.js` | Вся логика тестов (строки ~6600-7550) |
| `index.html` | Экраны: verbosMenu, verbosCategoryMenu, verbosOtrasMenu, verbosTestScreen, verbosFeedbackScreen, verbosResultsScreen |
| `css/Styles.css` | Стили карточек и прогресс-баров |
| `data/UnidadX.json` | Данные глаголов для каждой Unidad |
