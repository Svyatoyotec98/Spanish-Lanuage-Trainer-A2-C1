        // ═══════════════════════════════════════════════════════════════
        // PROFILE SYSTEM & PERSISTENCE ENGINE V4
        // ═══════════════════════════════════════════════════════════════

        const DEBUG = false;

        // Lista de todas las unidades disponibles (A2)
        const UNIDADES = [
            'unidad_1', 'unidad_2', 'unidad_3', 'unidad_4', 'unidad_5',
            'unidad_6', 'unidad_7', 'unidad_8', 'unidad_9', 'unidad_10'
        ];

        // ⚠️ DEPRECATED: Заменено динамическими группами из JSON
        // Lista de categorías de vocabulario (СТАРЫЙ КОД)
        // const CATEGORIES = ['sustantivos', 'adjetivos', 'verbos'];

        // Конфигурация категорий (СТАРЫЙ КОД - теперь группы определяются в JSON)
        // const CATEGORY_CONFIG = {
        //     sustantivos: {
        //         icon: '📦',
        //         es: 'Sustantivos',
        //         en: 'Nouns',
        //         ru: 'Существительные',
        //         hint: '(Существительное)'
        //     },
        //     adjetivos: {
        //         icon: '🎨',
        //         es: 'Adjetivos',
        //         en: 'Adjectives',
        //         ru: 'Прилагательные',
        //         hint: '(Прилагательное)'
        //     },
        //     verbos: {
        //         icon: '⚡',
        //         es: 'Verbos',
        //         en: 'Verbs',
        //         ru: 'Глаголы',
        //         hint: '(Глагол)'
        //     }
        // };

        // Переменная для отслеживания выбранного профиля для действий (удаление)
        let selectedProfileIdForAction = null;

        function getStorageKey() {
			const userId = getUserId();
			return'svt_progress' + (userId || 'guest');
		}

        // ═══════════════════════════════════════════════════════════════
        // HELPER FUNCTIONS - State Management
        // ═══════════════════════════════════════════════════════════════

        function loadAppState() {
            try {
                const raw = localStorage.getItem(getStorageKey());
                if (!raw) {
                    if (DEBUG) console.log('No saved state, creating new');
                    return {
                        activeProfileId: null,
                        profiles: {}
                    };
                }
                const state = JSON.parse(raw);
                if (DEBUG) console.log('Loaded state:', state);
                return state;
            } catch (e) {
                console.error('Failed to load state, resetting:', e);
                return {
                    activeProfileId: null,
                    profiles: {}
                };
            }
        }

        function saveAppState(state) {
            try {
                localStorage.setItem(getStorageKey(), JSON.stringify(state));
                if (DEBUG) console.log('State saved:', state);
				syncProgressToBackend();
            } catch (e) {
                console.error('Failed to save state:', e);
            }
        }

        function getActiveProfile() {
            const state = loadAppState();
            if (!state.activeProfileId) return null;
            return state.profiles[state.activeProfileId] || null;
        }

        function setActiveProfile(profileId) {
            const state = loadAppState();
            state.activeProfileId = profileId;
            if (state.profiles[profileId]) {
                state.profiles[profileId].lastSeenAt = Date.now();
            }
            saveAppState(state);
            updateUserBadge();
        }

        function createProfile(nickname) {
            const state = loadAppState();
            const profileId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            const newProfile = {
                id: profileId,
                nickname: nickname.trim(),
                createdAt: Date.now(),
                lastSeenAt: Date.now(),
                // Динамическая генерация progress для всех 10 unidades
                progress: Object.fromEntries(
                    UNIDADES.map(u => [u, {
                        sustantivos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 },
                        adjetivos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 },
                        verbos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 }
                    }])
                ),
                // Динамическая генерация unlocks (все кроме первой unidad заблокированы)
                unlocks: Object.fromEntries(
                    UNIDADES.slice(1).map(u => [u, false])
                )
            };

            state.profiles[profileId] = newProfile;
            state.activeProfileId = profileId;
            saveAppState(state);
            
            if (DEBUG) console.log('Profile created:', newProfile);
            return profileId;
        }

        function ensureProgressSkeleton(profile) {
            if (!profile.progress) profile.progress = {};
            // Динамическая генерация unlocks для всех unidades кроме первой
            if (!profile.unlocks) {
                profile.unlocks = Object.fromEntries(
                    UNIDADES.slice(1).map(u => [u, false])
                );
            }

            // Проверка и создание структуры для всех 10 unidades
            UNIDADES.forEach(unidad => {
                if (!profile.progress[unidad]) profile.progress[unidad] = {};

                // Динамическая инициализация групп (если JSON уже загружен)
                if (vocabularyData[unidad] && vocabularyData[unidad].groups) {
                    Object.keys(vocabularyData[unidad].groups).forEach(groupName => {
                        if (!profile.progress[unidad][groupName]) {
                            profile.progress[unidad][groupName] = {
                                easy: 0,
                                medium: 0,
                                hard: 0
                            };
                        }
                    });
                }

                // Exercises progress
                if (!profile.progress[unidad].ejercicios) {
                    profile.progress[unidad].ejercicios = {};
                }
            });

            return profile;
        }

        function updateProgress(unidad, category, level, score) {
            const profile = getActiveProfile();
            if (!profile) return;

            ensureProgressSkeleton(profile);

            const currentBest = profile.progress[unidad][category][level] || 0;
            const newScore = Math.round(score);

            if (newScore > currentBest) {
                profile.progress[unidad][category][level] = newScore;
                if (DEBUG) console.log(`Progress updated: ${unidad}/${category}/${level} = ${newScore}%`);
            }

            profile.lastSeenAt = Date.now();

            // Save back to localStorage
            const state = loadAppState();
            state.profiles[profile.id] = profile;
            saveAppState(state);

            // Update unlocks
            updateUnlocks();
        }

        function calculateCategoryProgress(unidad, category, profile = null) {
            if (!profile) {
                profile = getActiveProfile();
            }
            if (!profile) return 0;

            ensureProgressSkeleton(profile);

            const categoryData = profile.progress[unidad][category];

            // Проверяем размер группы
            const unidadData = vocabularyData[unidad];
            const groupSize = unidadData?.groups?.[category]?.length || 0;

            if (groupSize >= 10) {
                // Группа 10+ слов - 3 уровня (easy, medium, hard)
                // Всегда делим на 3, даже если какой-то уровень = 0
                const easy = categoryData.easy || 0;
                const medium = categoryData.medium || 0;
                const hard = categoryData.hard || 0;
                return Math.round((easy + medium + hard) / 3);
            } else {
                // Группа <10 слов - только Card Matching (easy уровень)
                return categoryData.easy || 0;
            }
        }

        function calculateUnidadProgress(unidad, profile = null) {
            if (!profile) {
                profile = getActiveProfile();
            }
            if (!profile) return 0;

            ensureProgressSkeleton(profile);

            // Формула 50/50: (Palabras + Ejercicios) / 2
            const palabrasProgress = calculatePalabrasProgress(unidad);
            const ejerciciosProgress = calculateGramaticaProgressForUnidad(unidad) || 0;

            return Math.round((palabrasProgress + ejerciciosProgress) / 2);
        }

        // Helper to calculate exercises progress for a specific unidad
        function calculateGramaticaProgressForUnidad(unidad) {
            const profile = getActiveProfile();
            if (!profile) return null;

            ensureProgressSkeleton(profile);

            const unidadData = vocabularyData[unidad];
            if (!unidadData || !unidadData.ejercicios || unidadData.ejercicios.length === 0) {
                return null;
            }

            let totalScore = 0;
            unidadData.ejercicios.forEach(exercise => {
                const score = profile.progress[unidad].ejercicios[exercise.id] || 0;
                totalScore += score;
            });

            return Math.round(totalScore / unidadData.ejercicios.length);
        }

        // Проверка доступности экзамена (требуется средний прогресс ≥80% по ТЕКУЩЕЙ Unidad)
        function checkExamAvailability() {
            const profile = getActiveProfile();
            if (!profile || !currentUnidad) return;

            // Проверяем что данные для текущей Unidad загружены
            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData) return;

            // Считаем прогресс Palabras (среднее по семантическим группам)
            const palabrasProgress = calculatePalabrasProgress(currentUnidad);

            // Считаем прогресс Ejercicios (среднее по упражнениям)
            const ejerciciosProgress = calculateGramaticaProgressForUnidad(currentUnidad) || 0;

            // Средний прогресс = (Palabras + Ejercicios) / 2
            const averageProgress = Math.round((palabrasProgress + ejerciciosProgress) / 2);

            console.log(`📊 Прогресс ${currentUnidad}: Palabras=${palabrasProgress}%, Ejercicios=${ejerciciosProgress}%, Среднее=${averageProgress}%`);

            // Получаем кнопку экзамена
            const examBtn = document.getElementById('examBtn');
            if (!examBtn) return;

            // Разблокируем кнопку, если средний прогресс ≥80%
            if (averageProgress >= 80) {
                examBtn.disabled = false;
                examBtn.classList.remove('btn-warning');
                examBtn.classList.add('btn-success');
                console.log(`✅ Экзамен разблокирован! Средний прогресс: ${averageProgress}%`);
            } else {
                examBtn.disabled = true;
                examBtn.classList.remove('btn-success');
                examBtn.classList.add('btn-warning');
                console.log(`⏳ Экзамен заблокирован. Средний прогресс: ${averageProgress}% (требуется 80%)`);
            }
        }

        // QA функция для принудительной разблокировки экзамена
        function unlockExam() {
            const examBtn = document.getElementById('examBtn');
            if (examBtn) {
                examBtn.disabled = false;
                examBtn.classList.remove('btn-warning');
                examBtn.classList.add('btn-success');
                console.log('🎓 QA: Экзамен разблокирован принудительно');
                alert('✅ Экзамен разблокирован!');
            }
        }

        function updateUnlocks() {
            const profile = getActiveProfile();
            if (!profile) return;

            // Динамическая проверка и разблокировка: каждая unidad разблокирует следующую при 80% прогресса
            UNIDADES.forEach((unidad, index) => {
                if (index < UNIDADES.length - 1) { // Пропускаем последнюю unidad (ей некого разблокировать)
                    const progress = calculateUnidadProgress(unidad);
                    const nextUnidad = UNIDADES[index + 1];

                    if (progress >= 80) {
                        profile.unlocks[nextUnidad] = true;
                    }
                }
            });

            // Save changes
            const state = loadAppState();
            state.profiles[profile.id] = profile;
            saveAppState(state);

            // Проверяем доступность экзамена после обновления unlocks
            checkExamAvailability();
        }

        // ═══════════════════════════════════════════════════════════════
        // UI NAVIGATION
        // ═══════════════════════════════════════════════════════════════

        function hideAll() {
            ['startScreen', 'profileSelectScreen', 'profileCreateScreen',
             'mainMenu', 'unidadMenu', 'palabrasMenu', 'groupPreviewMenu', 'categoryMenu', 'questionScreen',
             'resultsScreen', 'cardMatchingScreen', 'cardMatchingResultsScreen',
             'verbMenu', 'verbPracticeScreen', 'qaScreen',
			 'gramaticaMenu', 'gramaticaQuestionScreen', 'gramaticaResultsScreen',
             'grammarListScreen', 'grammarDetailScreen', 'grammarInteractiveScreen',
             'examScreen', 'examResultsScreen', 'miniDictionaryScreen',
             'exercisePreviewMenu', 'grammarRuleScreen', 'hardTestAllQuestionsScreen',
             'hardTestResultsScreen'].forEach(id => {
                document.getElementById(id).classList.add('hidden');
            });
        }

        function updateUserBadge() {
            const profile = getActiveProfile();
            const badge = document.getElementById('userBadge');
            const nicknameSpan = document.getElementById('userNickname');

            if (profile) {
                nicknameSpan.textContent = profile.nickname;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        function showUserBadge() {
            document.getElementById('userBadge').classList.remove('hidden');
        }

        function hideUserBadge() {
            document.getElementById('userBadge').classList.add('hidden');
        }

        function showStart() {
            hideAll();
            hideUserBadge();
            document.getElementById('startScreen').classList.remove('hidden');
        }

function showProfileSelect() {
    // Проверяем токен (без токена нельзя попасть сюда)
    const token = getToken();
    if (!token) {
        console.log('❌ Нет токена, редирект на login');
        showLoginScreen();
        return;
    }
    
    hideAllScreens();
    document.getElementById('profileSelectScreen').classList.remove('hidden');

    // Скрываем кнопки действий при отображении списка профилей
    hideProfileActionButtons();

    // Пока загружаем профили из localStorage (ВРЕМЕННО)
    // TODO: позже заменим на загрузку с backend
    renderProfileList();
	saveNavigationState('profileSelectScreen');
}

        

        function showProfileCreate() {
            hideAll();
            hideUserBadge();
            document.getElementById('profileCreateScreen').classList.remove('hidden');
            document.getElementById('nicknameInput').value = '';
            document.getElementById('nicknameError').classList.add('hidden');
            document.getElementById('nicknameInput').focus();
			saveNavigationState('profileCreateScreen');
        }

        function renderProfileList() {
            const state = loadAppState();
            const profileList = document.getElementById('profileList');
            profileList.innerHTML = '';

            const profiles = Object.values(state.profiles);
            
            if (profiles.length === 0) {
                profileList.innerHTML = '<p style="text-align:center; color:#7f8c8d;">Профили отсутствуют. Создайте свой первый профиль!</p>';
                return;
            }

            profiles.sort((a, b) => b.lastSeenAt - a.lastSeenAt);

            profiles.forEach(profile => {
                const isActive = state.activeProfileId === profile.id;
                const isSelected = selectedProfileIdForAction === profile.id;
                const card = document.createElement('div');
                card.className = 'profile-card' + (isActive ? ' active' : '') + (isSelected ? ' selected' : '');

                // Одинарный клик - выбор профиля (показать кнопки действий)
                card.onclick = () => {
                    fixProfileForAction(profile.id);
                };

                // Динамический расчёт среднего прогресса по всем 10 unidades
                const totalProgress = Math.round(
                    UNIDADES.reduce((sum, unidad) => sum + calculateUnidadProgress(unidad, profile), 0) / UNIDADES.length
                );

                const lastSeen = new Date(profile.lastSeenAt);
                const lastSeenStr = lastSeen.toLocaleDateString('ru-RU');

                card.innerHTML = `
                    <div class="profile-info">
                        <div class="profile-nickname">${profile.nickname}</div>
                        <div class="profile-meta">Последний визит: ${lastSeenStr}</div>
                    </div>
                    <div class="profile-progress">${totalProgress}%</div>
                `;

                profileList.appendChild(card);
            });
        }

        function selectProfile(profileId) {
            setActiveProfile(profileId);
            showMainMenu();
            updateUnidadUI();
        }

        function createProfileFromForm() {
            const input = document.getElementById('nicknameInput');
            const error = document.getElementById('nicknameError');
            const nickname = input.value.trim();

            error.classList.add('hidden');

            if (!nickname) {
                error.textContent = 'Никнейм не может быть пустым';
                error.classList.remove('hidden');
                return;
            }

            if (nickname.length > 24) {
                error.textContent = 'Никнейм слишком длинный (макс. 24 символа)';
                error.classList.remove('hidden');
                return;
            }

            if (/^\s+$/.test(input.value)) {
                error.textContent = 'Никнейм не может состоять только из пробелов';
                error.classList.remove('hidden');
                return;
            }

            createProfile(nickname);
            showMainMenu();
            updateUnidadUI();
        }

        function switchProfile() {
            showProfileSelect();
        }

        // ═══════════════════════════════════════════════════════════════
        // PROFILE DELETION FUNCTIONALITY
        // ═══════════════════════════════════════════════════════════════

        function fixProfileForAction(profileId) {
            selectedProfileIdForAction = profileId;

            // Убираем класс 'selected' со всех карточек
            const allCards = document.querySelectorAll('.profile-card');
            allCards.forEach(card => card.classList.remove('selected'));

            // Добавляем класс 'selected' к кликнутой карточке
            const clickedCard = Array.from(allCards).find(card => {
                const nickname = card.querySelector('.profile-nickname').textContent;
                const state = loadAppState();
                const profile = Object.values(state.profiles).find(p => p.nickname === nickname);
                return profile && profile.id === profileId;
            });

            if (clickedCard) {
                clickedCard.classList.add('selected');
            }

            showProfileActionButtons();
        }

        function showProfileActionButtons() {
            const buttonsDiv = document.getElementById('profileActionButtons');
            if (buttonsDiv) {
                buttonsDiv.classList.remove('hidden');
            }
        }

        function hideProfileActionButtons() {
            const buttonsDiv = document.getElementById('profileActionButtons');
            if (buttonsDiv) {
                buttonsDiv.classList.add('hidden');
            }
            selectedProfileIdForAction = null;

            // Убираем класс 'selected' со всех карточек
            const allCards = document.querySelectorAll('.profile-card');
            allCards.forEach(card => card.classList.remove('selected'));
        }

        function confirmSelectProfile() {
            if (selectedProfileIdForAction) {
                selectProfile(selectedProfileIdForAction);
                hideProfileActionButtons();
            }
        }

        function showDeleteConfirmModal() {
            const modal = document.getElementById('deleteConfirmModal');
            if (modal) {
                modal.classList.remove('hidden');
            }
        }

        function hideDeleteConfirmModal() {
            const modal = document.getElementById('deleteConfirmModal');
            if (modal) {
                modal.classList.add('hidden');
            }
        }

        function confirmDeleteProfile(profileId) {
            selectedProfileIdForAction = profileId;
            showDeleteConfirmModal();
        }

        function deleteSelectedProfile() {
            if (!selectedProfileIdForAction) {
                hideDeleteConfirmModal();
                return;
            }

            const state = loadAppState();
            const profileToDelete = state.profiles[selectedProfileIdForAction];

            if (!profileToDelete) {
                hideDeleteConfirmModal();
                return;
            }

            // Удаляем профиль из state
            delete state.profiles[selectedProfileIdForAction];

            // Если удаляемый профиль был активным, сбрасываем activeProfileId
            if (state.activeProfileId === selectedProfileIdForAction) {
                state.activeProfileId = null;
            }

            // Сохраняем обновлённое состояние
            saveAppState(state);

            // Очищаем выбранный профиль
            selectedProfileIdForAction = null;

            // Закрываем модалку
            hideDeleteConfirmModal();

            // Перерисовываем список профилей
            renderProfileList();
        }

        function showMainMenu() {
            hideAll();
            showUserBadge();
            document.getElementById('mainMenu').classList.remove('hidden');
            updateUnidadUI();
			saveNavigationState('mainMenu');
        }

        function updateUnidadUI() {
            const profile = getActiveProfile();
            if (!profile) return;

            ensureProgressSkeleton(profile);

            // Динамическое обновление UI для всех unidades
            UNIDADES.forEach((unidad, index) => {
                const unidadNumber = unidad.split('_')[1]; // Извлекаем номер: 'unidad_1' → '1'
                const btn = document.getElementById(`unidad-${unidadNumber}-btn`);
                const progressBar = document.getElementById(`unidad-${unidadNumber}-progress-bar`);
                const progressText = document.getElementById(`unidad-${unidadNumber}-progress-text`);

                // Проверяем, что элементы существуют в HTML (некоторые могут ещё не быть добавлены)
                if (!btn || !progressBar || !progressText) return;

                const progress = calculateUnidadProgress(unidad);

                if (index === 0) {
                    // Первая unidad всегда разблокирована
                    progressBar.style.width = progress + '%';
                    progressText.textContent = progress + '%';
                } else {
                    // Остальные unidades могут быть заблокированы
                    const isUnlocked = profile.unlocks[unidad];
                    const prevUnidadNumber = UNIDADES[index - 1].split('_')[1];

                    if (isUnlocked) {
                        btn.classList.remove('locked');
                        btn.querySelector('.category-icon').textContent = '🔓';
                        progressBar.style.width = progress + '%';
                        progressText.textContent = progress + '%';
                    } else {
                        btn.classList.add('locked');
                        btn.querySelector('.category-icon').textContent = '🔒';
                        progressText.textContent = `Заблокировано - Завершите Unidad ${prevUnidadNumber} (80%)`;
                    }
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // VOCABULARY DATA
        // ═══════════════════════════════════════════════════════════════

        let currentUnidad = null;
        let currentCategory = null;
        let currentLevel = null;
        let currentCount = null;
        let currentQuestions = [];
        let currentQuestionIndex = 0;
        let score = 0;
	let __isAwaitingNext = false;
	let __questionToken = 0;

        // QA Mode - unlock all Palabras tests
        let __qaUnlockAllTests = false;

        // Palabras pagination
        let palabrasCurrentPage = 0;
        const PALABRAS_GROUPS_PER_PAGE = 4;

        // Timer variables
        let timerInterval = null;
        let timeLeft = 10;
        const TIMER_DURATION_DEFAULT = 10;
        const TIMER_DURATION_HARD_LONG = 20; // для сложного уровня с группами > 10 слов

        // Функция для получения длительности таймера
        function getTimerDuration() {
            // Для сложного уровня (ввод текста) с группами > 10 слов - 20 секунд
            if (currentLevel === 'hard' && currentQuestions && currentQuestions.length > 10) {
                return TIMER_DURATION_HARD_LONG;
            }
            return TIMER_DURATION_DEFAULT;
        }

        // Exam constants (ДОЛЖНЫ БЫТЬ ДО переменных состояния!)
        const EXAM_TIMER_DURATION = 10; // секунд на вопрос
        const EXAM_PASS_THRESHOLD = 80; // % для прохождения и разблокировки следующей Unidad
        const EXAM_PALABRAS_PERCENTAGE = 0.3; // 30% слов от каждой semantic group
        const EXAM_EJERCICIOS_PERCENTAGE = 0.3; // 30% вопросов от каждого упражнения
        const EXAM_SCORE_CORRECT = 1; // балл за правильный ответ
        const EXAM_SCORE_WRONG = -0.5; // штраф за неправильный ответ
        const EXAM_SCORE_SKIP = 0; // балл за пропуск

        // Exam state variables
        let examQuestions = []; // массив всех вопросов экзамена
        let examCurrentIndex = 0; // индекс текущего вопроса
        let examAnswers = []; // массив ответов пользователя {question, userAnswer, correctAnswer, isCorrect, score, group/exerciseId}
        let examScore = 0; // текущий счёт (может быть отрицательным из-за штрафов)
        let examTimerInterval = null; // интервал таймера экзамена
        let examTimeLeft = EXAM_TIMER_DURATION; // оставшееся время на текущий вопрос
        let examStartTime = null; // время начала экзамена (для статистики)

        // ═══════════════════════════════════════════════════════════════
        // HARD TEST ALL QUESTIONS MODE (для групп > 10 слов)
        // ═══════════════════════════════════════════════════════════════
        const HARD_TEST_PER_PAGE = 5; // вопросов на страницу
        const HARD_TEST_TIME_PER_QUESTION = 20; // секунд на вопрос
        let hardTestQuestions = []; // массив всех вопросов {word, sentence, answer}
        let hardTestAnswers = {}; // ответы пользователя {0: "palabra", 1: "cosa", ...}
        let hardTestCurrentPage = 0; // текущая страница (0-indexed)
        let hardTestTotalPages = 0; // всего страниц
        let hardTestTimerInterval = null; // интервал таймера
        let hardTestTimeLeft = 0; // оставшееся время в секундах

        // Словарь загружается из JSON файлов при инициализации
        const vocabularyData = {};

        // ═══════════════════════════════════════════════════════════════
        // UNIDAD & CATEGORY NAVIGATION
        // ═══════════════════════════════════════════════════════════════

        function showUnidadMenu(unidad) {
            const profile = getActiveProfile();
            if (!profile) return;

            // Динамическая проверка разблокировки (первая unidad всегда доступна)
            const unidadIndex = UNIDADES.indexOf(unidad);
            if (unidadIndex > 0 && !profile.unlocks[unidad]) {
                const prevUnidad = UNIDADES[unidadIndex - 1];
                const prevUnidadNumber = prevUnidad.split('_')[1];
                const currentUnidadNumber = unidad.split('_')[1];
                alert(`Завершите Unidad ${prevUnidadNumber} со средним прогрессом 80% для разблокировки Unidad ${currentUnidadNumber}`);
                return;
            }

            currentUnidad = unidad;
            hideAll();
            showUserBadge();
            document.getElementById('unidadMenu').classList.remove('hidden');

            // Динамическая генерация заголовка
            const unidadNumber = unidad.split('_')[1];
            document.getElementById('unidadTitle').textContent = `Unidad ${unidadNumber}`;

            // Обновление прогресса
            updateUnidadProgressBars();
			saveNavigationState('unidadMenu');
        }

        function updateUnidadProgressBars() {
            const profile = getActiveProfile();
            if (!profile) return;

            // Average progress (now includes grammar)
            const avgProgress = calculateUnidadProgress(currentUnidad);

            // Update average progress (just text, no bar in v3 style)
            const avgText = document.getElementById('avg-progress-text');
            if (avgText) avgText.textContent = avgProgress;

            // Individual groups (dynamic)
            const unidadData = vocabularyData[currentUnidad];
            if (unidadData && unidadData.groups) {
                Object.keys(unidadData.groups).forEach(groupName => {
                    const progress = calculateCategoryProgress(currentUnidad, groupName);
                    const barElem = document.getElementById(`${groupName}-progress-bar`);
                    const textElem = document.getElementById(`${groupName}-progress-text`);
                    if (barElem) barElem.style.width = progress + '%';
                    if (textElem) textElem.textContent = progress + '%';
                });
            }

            // Exercises progress bar
            const exercisesProgress = calculateGramaticaProgressForUnidad(currentUnidad);
            if (exercisesProgress !== null) {
                const barElem = document.getElementById('ejercicios-progress-bar') || document.getElementById('gramatica-progress-bar');
                const textElem = document.getElementById('ejercicios-progress-text') || document.getElementById('gramatica-progress-text');
                if (barElem) barElem.style.width = exercisesProgress + '%';
                if (textElem) textElem.textContent = exercisesProgress + '%';
            } else {
                const barElem = document.getElementById('ejercicios-progress-bar') || document.getElementById('gramatica-progress-bar');
                const textElem = document.getElementById('ejercicios-progress-text') || document.getElementById('gramatica-progress-text');
                if (barElem) barElem.style.width = '0%';
                if (textElem) textElem.textContent = 'Нет упражнений';
            }

            // Update Palabras progress bar in unidadMenu
            const palabrasProgress = calculatePalabrasProgress(currentUnidad);
            const palabrasBar = document.getElementById('palabras-progress-bar');
            const palabrasText = document.getElementById('palabras-progress-text');
            if (palabrasBar) palabrasBar.style.width = palabrasProgress + '%';
            if (palabrasText) palabrasText.textContent = palabrasProgress + '%';

            // Проверяем доступность экзамена после обновления прогресса
            checkExamAvailability();
        }

        // Calculate average progress for all vocabulary groups
        function calculatePalabrasProgress(unidad) {
            const profile = getActiveProfile();
            if (!profile) return 0;

            const unidadData = vocabularyData[unidad];
            if (!unidadData || !unidadData.groups) return 0;

            let totalProgress = 0;
            let groupCount = 0;

            Object.keys(unidadData.groups).forEach(groupName => {
                totalProgress += calculateCategoryProgress(unidad, groupName, profile);
                groupCount++;
            });

            return groupCount > 0 ? Math.round(totalProgress / groupCount) : 0;
        }

        // Show Palabras menu with all semantic groups
        function showPalabrasMenu() {
            if (!currentUnidad) {
                console.error('showPalabrasMenu called without currentUnidad');
                return;
            }

            palabrasCurrentPage = 0; // Reset to first page

            hideAll();
            showUserBadge();
            document.getElementById('palabrasMenu').classList.remove('hidden');

            // Render group cards dynamically
            renderGroupCards();
            updatePalabrasPagination();

            // Update progress
            const palabrasProgress = calculatePalabrasProgress(currentUnidad);
            const avgText = document.getElementById('palabras-avg-progress-text');
            if (avgText) avgText.textContent = palabrasProgress;

            saveNavigationState('palabrasMenu');
        }

        // Render semantic group cards in Palabras menu
        function renderGroupCards() {
            const container = document.getElementById('groupsContainer');
            if (!container) {
                console.error('groupsContainer not found in HTML');
                return;
            }

            container.innerHTML = '';

            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData || !unidadData.groups) {
                console.error('No groups data available for', currentUnidad);
                return;
            }

            const groupNames = Object.keys(unidadData.groups);
            const profile = getActiveProfile();

            // Pagination logic
            const startIdx = palabrasCurrentPage * PALABRAS_GROUPS_PER_PAGE;
            const endIdx = Math.min(startIdx + PALABRAS_GROUPS_PER_PAGE, groupNames.length);
            const pageGroups = groupNames.slice(startIdx, endIdx);

            pageGroups.forEach(groupName => {
                const card = document.createElement('div');
                card.className = 'category-card';
                card.onclick = () => showGroupPreview(groupName);

                // Используем название группы как заголовок
                const displayName = groupName.replace(/_/g, ' ');
                const wordsCount = unidadData.groups[groupName].length;

                // Calculate progress for this group
                const progress = calculateCategoryProgress(currentUnidad, groupName, profile);

                card.innerHTML = `
                    <div class="category-header">
                        <span class="category-title">${displayName}</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${progress}%; background: #27ae60;"></div>
                    </div>
                    <p class="progress-text">${progress}%</p>
                `;

                container.appendChild(card);
            });
        }

        // Pagination functions for Palabras
        function updatePalabrasPagination() {
            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData || !unidadData.groups) return;

            const groupNames = Object.keys(unidadData.groups);
            const totalPages = Math.ceil(groupNames.length / PALABRAS_GROUPS_PER_PAGE);
            const paginationContainer = document.getElementById('palabrasPagination');
            const pageIndicator = document.getElementById('palabrasPageIndicator');
            const prevBtn = document.getElementById('palabrasPrevBtn');
            const nextBtn = document.getElementById('palabrasNextBtn');

            // Скрываем весь блок пагинации если только 1 страница
            if (paginationContainer) {
                paginationContainer.style.display = totalPages <= 1 ? 'none' : 'flex';
            }

            if (pageIndicator) pageIndicator.textContent = `Страница ${palabrasCurrentPage + 1} / ${totalPages}`;
            if (prevBtn) prevBtn.classList.toggle('hidden', palabrasCurrentPage === 0);
            if (nextBtn) nextBtn.classList.toggle('hidden', palabrasCurrentPage >= totalPages - 1);
        }

        function palabrasPrevPage() {
            if (palabrasCurrentPage > 0) {
                palabrasCurrentPage--;
                renderGroupCards();
                updatePalabrasPagination();
            }
        }

        function palabrasNextPage() {
            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData || !unidadData.groups) return;

            const groupNames = Object.keys(unidadData.groups);
            const totalPages = Math.ceil(groupNames.length / PALABRAS_GROUPS_PER_PAGE);
            if (palabrasCurrentPage < totalPages - 1) {
                palabrasCurrentPage++;
                renderGroupCards();
                updatePalabrasPagination();
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // MINI DICTIONARY PAGINATION
        // ═══════════════════════════════════════════════════════════════
        let miniDictCurrentPage = 0;
        const MINI_DICT_ITEMS_PER_PAGE = 6;
        let miniDictAllWords = [];

        // ═══════════════════════════════════════════════════════════════
        // GROUP PREVIEW MENU (промежуточный экран)
        // ═══════════════════════════════════════════════════════════════

        function showGroupPreview(category) {
            if (!currentUnidad) {
                console.error('showGroupPreview called without currentUnidad');
                return;
            }
            currentCategory = category;

            hideAll();
            showUserBadge();
            document.getElementById('groupPreviewMenu').classList.remove('hidden');

            // Заголовок
            const displayName = category.replace(/_/g, ' ');
            document.getElementById('groupPreviewTitle').textContent = displayName;

            // Прогресс группы
            const progress = calculateCategoryProgress(currentUnidad, category);
            document.getElementById('group-preview-progress-text').textContent = progress;

            // ═══════════════════════════════════════════════════════════════
            // БЛОКИРОВКА КНОПКИ ТЕСТА: если словарь не просмотрен
            // ═══════════════════════════════════════════════════════════════
            const wordsViewed = isWordsViewed(currentUnidad, category);
            const testBtn = document.getElementById('groupTestBtn');
            const testBtnLabel = document.getElementById('groupTestBtnLabel');
            const testHint = document.getElementById('groupTestHint');

            if (wordsViewed) {
                // Разблокировано
                testBtn.disabled = false;
                testBtn.style.opacity = '1';
                testBtn.style.cursor = 'pointer';
                testBtn.style.borderColor = '#27ae60';
                testBtnLabel.innerHTML = 'Пройти<br>тест';
                testHint.classList.add('hidden');
            } else {
                // Заблокировано
                testBtn.disabled = true;
                testBtn.style.opacity = '0.5';
                testBtn.style.cursor = 'not-allowed';
                testBtn.style.borderColor = '#95a5a6';
                testBtnLabel.innerHTML = '🔒 Пройти<br>тест';
                testHint.classList.remove('hidden');
            }

            saveNavigationState('groupPreviewMenu');
        }

        function proceedToTest() {
            // Проверяем, просмотрен ли словарь
            if (!isWordsViewed(currentUnidad, currentCategory)) {
                alert('Сначала просмотрите словарь до конца!');
                return;
            }
            // Вызывает старую логику showCategoryMenu
            // которая проверяет размер группы и решает: Card Matching или меню уровней
            showCategoryMenu(currentCategory);
        }

        function showMiniDictionary() {
            if (!currentUnidad || !currentCategory) {
                console.error('showMiniDictionary: missing unidad or category');
                return;
            }

            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData || !unidadData.groups || !unidadData.groups[currentCategory]) {
                console.error('showMiniDictionary: no data for', currentCategory);
                return;
            }

            // Сохраняем все слова и сбрасываем пагинацию
            miniDictAllWords = unidadData.groups[currentCategory];
            miniDictCurrentPage = 0;

            hideAll();
            showUserBadge();
            document.getElementById('miniDictionaryScreen').classList.remove('hidden');

            // Set title and subtitle
            const displayName = currentCategory.replace(/_/g, ' ');
            document.getElementById('miniDictTitle').textContent = `📖 ${displayName}`;
            document.getElementById('miniDictSubtitle').textContent = `Мини-Словарь группы`;

            // Рендерим первую страницу
            renderMiniDictPage();
            updateMiniDictPagination();

            saveNavigationState('miniDictionaryScreen');
        }

        // Рендер текущей страницы словаря
        function renderMiniDictPage() {
            const container = document.getElementById('miniDictWordsContainer');
            const totalPages = Math.ceil(miniDictAllWords.length / MINI_DICT_ITEMS_PER_PAGE);
            const isLastPage = miniDictCurrentPage >= totalPages - 1;
            const alreadyViewed = isWordsViewed(currentUnidad, currentCategory);

            // Обновляем информацию о странице
            document.getElementById('miniDictPageInfo').textContent =
                `Страница ${miniDictCurrentPage + 1} из ${totalPages}`;

            // Получаем слова для текущей страницы
            const startIdx = miniDictCurrentPage * MINI_DICT_ITEMS_PER_PAGE;
            const endIdx = Math.min(startIdx + MINI_DICT_ITEMS_PER_PAGE, miniDictAllWords.length);
            const pageWords = miniDictAllWords.slice(startIdx, endIdx);

            // Helper functions
            const capitalize = (str) => str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const removeArticle = (word) => word.replace(/^(el|la|los|las)\s+/i, '');

            // Рендерим слова текущей страницы
            container.innerHTML = pageWords.map((word) => {
                const sentences = word.hardSentences ? word.hardSentences.slice(0, 2) : [];
                const sentencesRu = word.hardSentencesRu ? word.hardSentencesRu.slice(0, 2) : [];
                const wordWithoutArticle = removeArticle(word.spanish);
                const fillSentence = (s) => s.replace('___', `<strong>${wordWithoutArticle}</strong>`);

                return `
                <div class="mini-dict-word" style="
                    background: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 12px;
                    padding: 15px;
                    margin-bottom: 12px;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.2);">
                        <span style="font-weight: 700; color: #2c3e50; font-size: 1.95em;">${capitalize(word.spanish)}</span>
                        <span style="color: #fff; font-size: 1.65em; font-style: italic;">${capitalize(word.ru)}</span>
                    </div>
                    ${sentences.length > 0 ? `
                    <div style="margin-top: 6px;">
                        ${sentences.map((s, i) => `
                            <div style="margin-bottom: 6px;">
                                <div style="color: #2c3e50; font-size: 1.4em;">${fillSentence(s)}</div>
                                ${sentencesRu[i] ? `<div style="color: #fff; font-size: 1.35em; font-style: italic; margin-top: 2px;">${sentencesRu[i]}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}
                </div>
            `}).join('');

            // Скролл наверх контейнера
            container.scrollTop = 0;

            // Обработчик скролла только на последней странице
            container.removeEventListener('scroll', handleDictionaryScroll);
            if (isLastPage && !alreadyViewed) {
                container.addEventListener('scroll', handleDictionaryScroll);
            }
        }

        // Обновление кнопок пагинации
        function updateMiniDictPagination() {
            const totalPages = Math.ceil(miniDictAllWords.length / MINI_DICT_ITEMS_PER_PAGE);
            const isFirstPage = miniDictCurrentPage === 0;
            const isLastPage = miniDictCurrentPage >= totalPages - 1;
            const alreadyViewed = isWordsViewed(currentUnidad, currentCategory);

            const prevBtn = document.getElementById('miniDictPrevBtn');
            const nextBtn = document.getElementById('miniDictNextBtn');
            const goToTestBlock = document.getElementById('miniDictGoToTestBlock');

            // Кнопка "Назад" - показываем только со 2-й страницы
            if (isFirstPage) {
                prevBtn.classList.add('hidden');
            } else {
                prevBtn.classList.remove('hidden');
            }

            // Кнопка "Дальше" - скрываем на последней странице
            if (isLastPage) {
                nextBtn.classList.add('hidden');
            } else {
                nextBtn.classList.remove('hidden');
            }

            // Блок "Словарь просмотрен" - показываем на последней странице если уже просмотрено
            if (isLastPage && alreadyViewed) {
                goToTestBlock.classList.remove('hidden');
            } else {
                goToTestBlock.classList.add('hidden');
            }
        }

        // Следующая страница словаря
        function nextMiniDictPage() {
            const totalPages = Math.ceil(miniDictAllWords.length / MINI_DICT_ITEMS_PER_PAGE);
            if (miniDictCurrentPage < totalPages - 1) {
                miniDictCurrentPage++;
                renderMiniDictPage();
                updateMiniDictPagination();
            }
        }

        // Предыдущая страница словаря
        function prevMiniDictPage() {
            if (miniDictCurrentPage > 0) {
                miniDictCurrentPage--;
                renderMiniDictPage();
                updateMiniDictPagination();
            }
        }

        // Обработчик скролла в словаре (только на последней странице)
        function handleDictionaryScroll() {
            const container = document.getElementById('miniDictWordsContainer');
            if (!container) return;

            // Проверяем, долистали ли до конца
            const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;

            if (isAtBottom && currentUnidad && currentCategory) {
                // Сохраняем флаг просмотра
                saveWordsViewed(currentUnidad, currentCategory);

                // Показываем блок "Перейти к тесту"
                const goToTestBlock = document.getElementById('miniDictGoToTestBlock');
                if (goToTestBlock) {
                    goToTestBlock.classList.remove('hidden');
                }

                // Убираем обработчик
                container.removeEventListener('scroll', handleDictionaryScroll);
            }
        }

        // Перейти к тесту из словаря
        function goToTestFromDictionary() {
            if (!currentUnidad || !currentCategory) return;

            // Проверяем размер группы
            const unidadData = vocabularyData[currentUnidad];
            const groupSize = unidadData?.groups?.[currentCategory]?.length || 0;

            if (groupSize < 10) {
                // Маленькая группа - сразу Card Matching
                startCardMatchingGame();
            } else {
                // Большая группа - меню выбора уровня
                showCategoryMenu(currentCategory);
            }
        }

        function backToGroupPreview() {
            showGroupPreview(currentCategory);
        }

        function showCategoryMenu(category) {
			if (!currentUnidad) {
				console.error('showCategoryMenu called without currentUnidad');
			return;
			}
            currentCategory = category;

            // ═══════════════════════════════════════════════════════════════
            // ПРОВЕРКА: если группа <10 слов, сразу запускаем Card Matching!
            // ═══════════════════════════════════════════════════════════════
            const unidadData = vocabularyData[currentUnidad];
            const groupSize = unidadData?.groups[category]?.length || 0;

            if (groupSize < 10) {
                // Маленькая группа - запускаем Card Matching напрямую, минуя categoryMenu
                startCardMatchingGame();
                return;
            }

            // Большая группа - показываем обычное меню с уровнями сложности
            hideAll();
            showUserBadge();
            document.getElementById('categoryMenu').classList.remove('hidden');

            // Динамический заголовок для группы
            const displayName = category.replace(/_/g, ' ');
            document.getElementById('categoryTitle').textContent = displayName;

            updateCategoryButtons();
			saveNavigationState('categoryMenu');
        }

        function updateCategoryButtons() {
            const profile = getActiveProfile();
            if (!profile) return;

            ensureProgressSkeleton(profile);
			
if (
  !profile.progress ||
  !profile.progress[currentUnidad] ||
  !profile.progress[currentUnidad][currentCategory]
) {
  console.warn('Progress not initialized yet, fixing...', {
    currentUnidad,
    currentCategory,
    progress: profile.progress
  });
  ensureProgressSkeleton(profile);
  const state = loadAppState();
  state.profiles[profile.id] = profile;
  saveAppState(state);
}


            const categoryData = profile.progress[currentUnidad][currentCategory];

            // Update category average progress (just text, no bar)
            const avgProgress = calculateCategoryProgress(currentUnidad, currentCategory);
            const avgText = document.getElementById('category-avg-progress-text');
            if (avgText) avgText.textContent = avgProgress;

            // ═══════════════════════════════════════════════════════════════
            // DETERMINE TEST TYPE BASED ON GROUP SIZE
            // ═══════════════════════════════════════════════════════════════
            const unidadData = vocabularyData[currentUnidad];
            const groupSize = unidadData?.groups[currentCategory]?.length || 0;

            const cardMatchingSection = document.getElementById('cardMatchingSection');
            const abcdTestsSection = document.getElementById('abcdTestsSection');
            const categorySubtitle = document.getElementById('categorySubtitle');

            if (groupSize < 10) {
                // Small group: show Card Matching, hide ABCD tests
                if (cardMatchingSection) cardMatchingSection.classList.remove('hidden');
                if (abcdTestsSection) abcdTestsSection.style.display = 'none';
                if (categorySubtitle) categorySubtitle.textContent = 'Выберите режим практики';

                // Update Card Matching button
                const cardMatchingBtn = document.getElementById('card-matching-btn');
                const cardMatchingProgress = document.getElementById('card-matching-progress');
                if (cardMatchingBtn && cardMatchingProgress) {
                    const cardMatchingScore = categoryData.easy || 0;
                    cardMatchingProgress.textContent = `Лучший: ${cardMatchingScore}%`;

                    // Change button color based on score
                    if (cardMatchingScore >= 80) {
                        cardMatchingBtn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
                    } else if (cardMatchingScore > 0) {
                        cardMatchingBtn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
                    } else {
                        cardMatchingBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    }
                }

                return; // Skip ABCD test logic
            } else {
                // Large group: show ABCD tests, hide Card Matching
                if (cardMatchingSection) cardMatchingSection.classList.add('hidden');
                if (abcdTestsSection) abcdTestsSection.style.display = 'block';
                if (categorySubtitle) categorySubtitle.textContent = 'Выберите сложность и количество вопросов';
            }

            // ═══════════════════════════════════════════════════════════════
            // UPDATE LEVEL BUTTONS AND PROGRESS BARS
            // ═══════════════════════════════════════════════════════════════

            // Easy Level - always available
            const easyScore = categoryData.easy || 0;
            const easyBtn = document.getElementById('easy-btn');
            const easyProgressBar = document.getElementById('easy-progress-bar');
            const easyProgressText = document.getElementById('easy-progress-text');

            if (easyProgressBar) easyProgressBar.style.width = `${easyScore}%`;
            if (easyProgressText) easyProgressText.textContent = `${easyScore}%`;
            if (easyBtn) {
                easyBtn.disabled = false;
                if (easyScore >= 80) {
                    easyBtn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
                } else if (easyScore > 0) {
                    easyBtn.style.background = 'linear-gradient(135deg, #27ae60, #229954)';
                } else {
                    easyBtn.style.background = '#27ae60';
                }
            }

            // Medium Level - unlocks when Easy >= 80%
            const mediumScore = categoryData.medium || 0;
            const mediumBtn = document.getElementById('medium-btn');
            const mediumProgressBar = document.getElementById('medium-progress-bar');
            const mediumProgressText = document.getElementById('medium-progress-text');

            if (mediumProgressBar) mediumProgressBar.style.width = `${mediumScore}%`;
            if (mediumProgressText) mediumProgressText.textContent = `${mediumScore}%`;
            if (mediumBtn) {
                if (easyScore >= 80 || __qaUnlockAllTests) {
                    mediumBtn.disabled = false;
                    mediumBtn.querySelector('.level-btn-label').textContent = 'Начать тест';
                    if (mediumScore >= 80) {
                        mediumBtn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
                    } else if (mediumScore > 0) {
                        mediumBtn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
                    } else {
                        mediumBtn.style.background = '#f39c12';
                    }
                } else {
                    mediumBtn.disabled = true;
                    mediumBtn.querySelector('.level-btn-label').textContent = '🔒 Требуется 80% на Лёгкий';
                    mediumBtn.style.background = '#999';
                    mediumBtn.style.opacity = '0.6';
                }
            }

            // Hard Level - unlocks when Medium >= 80%
            const hardScore = categoryData.hard || 0;
            const hardBtn = document.getElementById('hard-btn');
            const hardProgressBar = document.getElementById('hard-progress-bar');
            const hardProgressText = document.getElementById('hard-progress-text');

            if (hardProgressBar) hardProgressBar.style.width = `${hardScore}%`;
            if (hardProgressText) hardProgressText.textContent = `${hardScore}%`;
            if (hardBtn) {
                if (mediumScore >= 80 || __qaUnlockAllTests) {
                    hardBtn.disabled = false;
                    hardBtn.querySelector('.level-btn-label').textContent = 'Начать тест';
                    if (hardScore >= 80) {
                        hardBtn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
                    } else if (hardScore > 0) {
                        hardBtn.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
                    } else {
                        hardBtn.style.background = '#e74c3c';
                    }
                } else {
                    hardBtn.disabled = true;
                    hardBtn.querySelector('.level-btn-label').textContent = '🔒 Требуется 80% на Средний';
                    hardBtn.style.background = '#999';
                    hardBtn.style.opacity = '0.6';
                }
            }
        }

        function backToUnidadMenu() {
            showUnidadMenu(currentUnidad);
        }

        // ═══════════════════════════════════════════════════════════════
        // TEST LOGIC
        // ═══════════════════════════════════════════════════════════════
		
		function shuffleArray(array) {
			const result = [...array];
			for (let i =result.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				const temp = result[i];
				result[i] = result[j];
				result[j] = temp;
			}
			return result;
		}

        function startTest(level) {
            // Проверка существования данных
            if (!vocabularyData[currentUnidad]) {
                alert(`Ошибка: данные для ${currentUnidad} не загружены.\nПопробуйте обновить страницу (F5).`);
                console.error(`startTest: vocabularyData[${currentUnidad}] is undefined`);
                return;
            }

            if (!vocabularyData[currentUnidad].groups[currentCategory]) {
                alert(`Ошибка: группа "${currentCategory}" не найдена в ${currentUnidad}.\nВозможно, файл JSON повреждён.`);
                console.error(`startTest: vocabularyData[${currentUnidad}].groups[${currentCategory}] is undefined`);
                return;
            }

            const words = vocabularyData[currentUnidad].groups[currentCategory];

            if (!words || words.length === 0) {
                alert(`Ошибка: категория "${currentCategory}" пуста в ${currentUnidad}.\nДобавьте слова в JSON файл.`);
                console.error(`startTest: vocabularyData[${currentUnidad}][${currentCategory}] is empty`);
                return;
            }

            // ═══════════════════════════════════════════════════════════════
            // HARD TEST для групп > 10 слов — новый формат (все вопросы на экране)
            // ═══════════════════════════════════════════════════════════════
            if (level === 'hard' && words.length > 10) {
                startHardTestAllQuestions(words);
                return;
            }

            // Используем ВСЕ слова из группы
            const count = words.length;

            currentLevel = level;
            currentCount = count;
            currentQuestionIndex = 0;
            score = 0;

            // Перемешиваем и используем все слова
            const shuffled = shuffleArray(words);
            currentQuestions = shuffled;

            hideAll();
            showUserBadge();
            document.getElementById('questionScreen').classList.remove('hidden');

            showQuestion();
        }

        // ═══════════════════════════════════════════════════════════════
        // TIMER FUNCTIONS
        // ═══════════════════════════════════════════════════════════════

        function startTimer() {
            stopTimer();
            timeLeft = getTimerDuration();
            updateTimerDisplay();

            timerInterval = setInterval(() => {
                timeLeft -= 0.1;
                updateTimerDisplay();

                if (timeLeft <= 0) {
                    stopTimer();
                    handleTimeOut();
                }
            }, 100);
        }

        function stopTimer() {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        }

        function updateTimerDisplay() {
            const timerBar = document.getElementById('timerBar');
            const timerText = document.getElementById('timerText');

            if (!timerBar || !timerText) return;

            const percentage = (timeLeft / getTimerDuration()) * 100;
            timerBar.style.width = percentage + '%';
            timerText.textContent = Math.ceil(timeLeft);

            // Remove all color classes
            timerBar.classList.remove('timer-warning', 'timer-danger');
            timerText.classList.remove('timer-text-warning', 'timer-text-danger');

            // Add color based on time left (пропорционально длительности)
            const duration = getTimerDuration();
            const dangerThreshold = duration * 0.3; // 30% времени - красный
            const warningThreshold = duration * 0.5; // 50% времени - оранжевый

            if (timeLeft <= dangerThreshold) {
                timerBar.classList.add('timer-danger');
                timerText.classList.add('timer-text-danger');
            } else if (timeLeft <= warningThreshold) {
                timerBar.classList.add('timer-warning');
                timerText.classList.add('timer-text-warning');
            }
        }

        function handleTimeOut() {
            if (__isAwaitingNext) return;
            __isAwaitingNext = true;

            const question = currentQuestions[currentQuestionIndex];
            const correctText = currentLevel === 'easy' ? question.ru : question.spanish;
            showFeedback(false, `Время вышло! Правильный ответ: ${correctText}`);
        }

        function showQuestion() {
            if  (currentQuestionIndex >= currentQuestions.length) {
                stopTimer();
                showResults();
                return;
            }
		__isAwaitingNext = false;
		__questionToken++;

            const question = currentQuestions[currentQuestionIndex];
            document.getElementById('questionProgress').textContent =
                `Вопрос ${currentQuestionIndex + 1} из ${currentQuestions.length}`;

            // Start timer for this question
            startTimer();

            // ═══════════════════════════════════════════════════════════════
            // LEVEL-BASED MODE SELECTION (NO RANDOM!)
            // ═══════════════════════════════════════════════════════════════
            // Easy: ES→RU, Multiple Choice (вопрос испанский, ответы русские)
            // Medium: RU→ES, Multiple Choice (вопрос русский, ответы испанские)
            // Hard: RU→ES, Manual Input (вопрос русский, ввод испанского)
            // ═══════════════════════════════════════════════════════════════
            
            if (currentLevel === 'easy') {
                // Easy: ES→RU, ABCD
                const iconName = question.icon || 'question';
                document.getElementById('questionIcon').innerHTML = `<i class="ph ph-${iconName}"></i>`;
                document.getElementById('questionText').textContent = question.spanish;
                showMultipleChoice(question, 'easy');
            } else if (currentLevel === 'medium') {
                // Medium: RU→ES, ABCD
                const iconName = question.icon || 'question';
                document.getElementById('questionIcon').innerHTML = `<i class="ph ph-${iconName}"></i>`;
                document.getElementById('questionText').textContent = question.ru;
                showMultipleChoice(question, 'medium');
            } else if (currentLevel === 'hard') {
                // Hard: RU→ES, Manual Input with sentence context
                document.getElementById('questionIcon').innerHTML = ''; // No icon for Hard test

                // Если есть hardSentences, показываем случайное предложение
                if (question.hardSentences && question.hardSentences.length > 0) {
                    const randomSentence = question.hardSentences[Math.floor(Math.random() * question.hardSentences.length)];
                    // Показываем предложение без подсказки
                    document.getElementById('questionText').textContent = randomSentence;
                } else {
                    // Fallback: показываем просто русский перевод
                    document.getElementById('questionText').textContent = question.ru;
                }

                showManualInput();
            }
        }

        function showMultipleChoice(question, level) {
            document.getElementById('multipleChoiceOptions').classList.remove('hidden');
            document.getElementById('manualInputContainer').classList.add('hidden');

            // Проверка существования данных
            if (!vocabularyData[currentUnidad] || !vocabularyData[currentUnidad].groups[currentCategory]) {
                console.error(`showMultipleChoice: vocabularyData[${currentUnidad}].groups[${currentCategory}] is undefined`);
                alert('Ошибка загрузки данных. Пожалуйста, обновите страницу.');
                return;
            }

            const words = vocabularyData[currentUnidad].groups[currentCategory];

            let correctAnswer, otherWords, options;
            
            if (level === 'easy') {
                // Easy: показываем русские варианты, правильный = ru
                correctAnswer = question.ru;
                otherWords = words.filter(w => w.ru !== question.ru);
                const shuffled = otherWords.sort(() => Math.random() - 0.5).slice(0, 3);
                options = [...shuffled.map(w => w.ru), correctAnswer].sort(() => Math.random() - 0.5);
            } else {
                // Medium: показываем испанские варианты, правильный = spanish
                correctAnswer = question.spanish;
                otherWords = words.filter(w => w.spanish !== question.spanish);
                const shuffled = otherWords.sort(() => Math.random() - 0.5).slice(0, 3);
                options = [...shuffled.map(w => w.spanish), correctAnswer].sort(() => Math.random() - 0.5);
            }

            const buttons = document.querySelectorAll('.option-btn');
            options.forEach((opt, i) => {
                buttons[i].textContent = opt;
                buttons[i].onclick = () => selectAnswer(i, opt === correctAnswer);
            });
        }

        function showManualInput() {
            document.getElementById('multipleChoiceOptions').classList.add('hidden');
            document.getElementById('manualInputContainer').classList.remove('hidden');
            document.getElementById('manualInput').value = '';
            document.getElementById('manualInput').focus();
        }

        function selectAnswer(index, isCorrect) {
	    if (__isAwaitingNext) return;
	    __isAwaitingNext = true;
            stopTimer();

            if (isCorrect) {
                score++;
                showFeedback(true, 'Правильно!');
            } else {
                const question = currentQuestions[currentQuestionIndex];
                const correctText = currentLevel === 'easy' ? question.ru : question.spanish;
                showFeedback(false, `Неправильно. Правильный ответ: ${correctText}`);
            }
        }

        function submitManualAnswer() {
	if (__isAwaitingNext) return;
	__isAwaitingNext = true;
            stopTimer();

            const input = document.getElementById('manualInput');
            const answer = input.value.trim().toLowerCase();
	    if (!answer) {
  	    __isAwaitingNext = false;
            return;
            }

            const question = currentQuestions[currentQuestionIndex];
            const correct = question.spanish.toLowerCase();

            // Remove articles for flexible matching
            const answerNoArticle = answer.replace(/^(el|la|los|las)\s+/, '');
            const correctNoArticle = correct.replace(/^(el|la|los|las)\s+/, '');

            if (answer === correct || answerNoArticle === correctNoArticle) {
                score++;
                showFeedback(true, 'Правильно!');
            } else {
                showFeedback(false, `Неправильно. Правильный ответ: ${question.spanish}`);
            }
        }

        function showFeedback(isCorrect, message) {
            const modal = document.getElementById('feedbackModal');
            const title = document.getElementById('modalTitle');
            const msg = document.getElementById('modalMessage');

            title.textContent = isCorrect ? 'Правильно! ✅' : 'Неправильно ❌';
            title.className = isCorrect ? 'modal-correct' : 'modal-incorrect';
            msg.textContent = message;

            modal.classList.remove('hidden');
        }

        function closeModal() {
            document.getElementById('feedbackModal').classList.add('hidden');
            currentQuestionIndex++;
            showQuestion();
        }

        function showResults() {
            hideAll();
            showUserBadge();
            document.getElementById('resultsScreen').classList.remove('hidden');

            const percentage = Math.round((score / currentQuestions.length) * 100);
            document.getElementById('resultsStats').textContent = 
                `Вы ответили правильно на ${score} из ${currentQuestions.length}!`;

            let grade, gradeClass;
            if (percentage >= 80) {
                grade = 'Отлично! 🎉';
                gradeClass = 'grade-excellent';
            } else if (percentage >= 60) {
                grade = 'Хорошо! Продолжайте практиковаться! 👍';
                gradeClass = 'grade-good';
            } else {
                grade = 'Продолжайте стараться! 💪';
                gradeClass = 'grade-retry';
            }

            const gradeEl = document.getElementById('resultsGrade');
            gradeEl.textContent = grade;
            gradeEl.className = 'grade ' + gradeClass;

            // ═══════════════════════════════════════════════════════════════
            // SAVE PROGRESS TO LOCALSTORAGE (CRITICAL!)
            // ═══════════════════════════════════════════════════════════════
            updateProgress(currentUnidad, currentCategory, currentLevel, percentage);

            // Update UI to reflect new progress
            updateCategoryButtons();
            updateUnidadProgressBars();
            updateUnidadUI();

            // Показываем/скрываем кнопку "Следующий тест"
            const nextTestBtn = document.getElementById('nextTestBtnResults');
            if (nextTestBtn) {
                nextTestBtn.style.display = hasNextTest() ? 'inline-block' : 'none';
            }
        }

        function retryTest() {
            startTest(currentLevel);
        }

        function exitTest() {
            if (confirm('Выйти из теста? Прогресс этой попытки не будет сохранён.')) {
                stopTimer();
                showCategoryMenu(currentCategory);
            }
        }

        // Skip current question and move to next (counts as wrong answer)
        function skipQuestion() {
            stopTimer();
            currentQuestionIndex++;
            showQuestion();
        }

        // ═══════════════════════════════════════════════════════════════
        // HARD TEST ALL QUESTIONS MODE (для групп > 10 слов)
        // ═══════════════════════════════════════════════════════════════

        /**
         * Запуск нового формата hard-теста для групп > 10 слов
         * @param {Array} words - массив слов из группы
         */
        function startHardTestAllQuestions(words) {
            // Сброс состояния
            hardTestAnswers = {};
            hardTestCurrentPage = 0;

            // Перемешиваем слова
            const shuffled = shuffleArray(words);

            // Формируем массив вопросов из предложений
            hardTestQuestions = shuffled.map((word, index) => {
                // Выбираем случайное предложение из hardSentences
                let sentence = `___ (${word.ru})`; // fallback
                if (word.hardSentences && word.hardSentences.length > 0) {
                    const randomIdx = Math.floor(Math.random() * word.hardSentences.length);
                    sentence = word.hardSentences[randomIdx];
                }

                return {
                    index: index,
                    word: word,
                    sentence: sentence,
                    answer: word.spanish.toLowerCase().trim(),
                    hint: word.ru // подсказка - русский перевод
                };
            });

            // Вычисляем количество страниц
            hardTestTotalPages = Math.ceil(hardTestQuestions.length / HARD_TEST_PER_PAGE);

            // Показываем экран
            hideAll();
            showUserBadge();
            document.getElementById('hardTestAllQuestionsScreen').classList.remove('hidden');

            // Устанавливаем заголовок группы
            document.getElementById('hardTestGroupTitle').textContent = currentCategory;

            // Рендерим первую страницу
            renderHardTestPage();

            // Обновляем индикаторы
            updateHardTestPageIndicator();

            // Запускаем общий таймер (20 сек на вопрос)
            startHardTestTimer();
        }

        /**
         * Запуск общего таймера
         */
        function startHardTestTimer() {
            // Останавливаем предыдущий таймер если был
            if (hardTestTimerInterval) {
                clearInterval(hardTestTimerInterval);
            }

            // Общее время = 20 сек × количество вопросов
            hardTestTimeLeft = HARD_TEST_TIME_PER_QUESTION * hardTestQuestions.length;

            // Обновляем отображение
            updateHardTestTimerDisplay();

            // Запускаем интервал (каждую секунду)
            hardTestTimerInterval = setInterval(() => {
                hardTestTimeLeft--;
                updateHardTestTimerDisplay();

                if (hardTestTimeLeft <= 0) {
                    hardTestTimeUp();
                }
            }, 1000);
        }

        /**
         * Обновление отображения таймера
         */
        function updateHardTestTimerDisplay() {
            const timerText = document.getElementById('hardTestGlobalTimer');
            const timerBar = document.getElementById('hardTestTimerBar');

            if (!timerText || !timerBar) return;

            // Форматируем время как M:SS
            const minutes = Math.floor(hardTestTimeLeft / 60);
            const seconds = hardTestTimeLeft % 60;
            timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Вычисляем процент оставшегося времени
            const totalTime = HARD_TEST_TIME_PER_QUESTION * hardTestQuestions.length;
            const percentage = (hardTestTimeLeft / totalTime) * 100;

            // Обновляем прогресс-бар
            timerBar.style.width = percentage + '%';

            // Меняем цвет в зависимости от оставшегося времени
            if (percentage > 50) {
                // Зелёный (больше 50%)
                timerBar.style.background = 'linear-gradient(90deg, #27ae60, #2ecc71)';
                timerText.style.color = '#27ae60';
            } else if (percentage > 20) {
                // Оранжевый (20-50%)
                timerBar.style.background = 'linear-gradient(90deg, #f39c12, #e67e22)';
                timerText.style.color = '#f39c12';
            } else {
                // Красный (меньше 20%)
                timerBar.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
                timerText.style.color = '#e74c3c';
            }
        }

        /**
         * Время вышло — автоматический не зачёт
         */
        function hardTestTimeUp() {
            // Останавливаем таймер
            if (hardTestTimerInterval) {
                clearInterval(hardTestTimerInterval);
                hardTestTimerInterval = null;
            }

            // Показываем сообщение и результат 0%
            alert('⏱ Время вышло! Результат: 0%');

            // Возвращаемся к меню категории
            showCategoryMenu(currentCategory);
        }

        /**
         * Остановка таймера
         */
        function stopHardTestTimer() {
            if (hardTestTimerInterval) {
                clearInterval(hardTestTimerInterval);
                hardTestTimerInterval = null;
            }
        }

        /**
         * Рендер текущей страницы вопросов
         */
        function renderHardTestPage() {
            const container = document.getElementById('hardTestQuestionsContainer');
            const startIdx = hardTestCurrentPage * HARD_TEST_PER_PAGE;
            const endIdx = Math.min(startIdx + HARD_TEST_PER_PAGE, hardTestQuestions.length);
            const pageQuestions = hardTestQuestions.slice(startIdx, endIdx);

            let html = '';

            pageQuestions.forEach((q, localIdx) => {
                const globalIdx = startIdx + localIdx;
                const savedAnswer = hardTestAnswers[globalIdx] || '';

                // Заменяем ___ на input
                const sentenceParts = q.sentence.split('___');
                const beforeBlank = sentenceParts[0] || '';
                const afterBlank = sentenceParts[1] || '';

                html += `
                    <div class="hard-test-question-item" style="
                        background: rgba(255, 255, 255, 0.15);
                        backdrop-filter: blur(10px);
                        -webkit-backdrop-filter: blur(10px);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 12px;
                        padding: 18px 20px;
                    ">
                        <div style="
                            display: flex;
                            align-items: center;
                            flex-wrap: wrap;
                            gap: 8px;
                            font-size: 1.2em;
                            color: #2c3e50;
                            line-height: 1.8;
                        ">
                            <span style="
                                background: rgba(102, 126, 234, 0.3);
                                color: #667eea;
                                font-weight: bold;
                                padding: 2px 10px;
                                border-radius: 50%;
                                font-size: 0.9em;
                                margin-right: 5px;
                            ">${globalIdx + 1}</span>
                            <span>${beforeBlank}</span>
                            <input
                                type="text"
                                class="hard-test-input"
                                data-index="${globalIdx}"
                                value="${savedAnswer}"
                                placeholder="···"
                                oninput="saveHardTestAnswer(${globalIdx}, this.value)"
                                style="
                                    width: 120px;
                                    padding: 4px 8px;
                                    border: none;
                                    border-bottom: 2px dashed rgba(102, 126, 234, 0.6);
                                    border-radius: 0;
                                    font-size: 1em;
                                    text-align: center;
                                    background: transparent;
                                    color: #2c3e50;
                                    outline: none;
                                "
                            />
                            <span>${afterBlank}</span>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;

            // Фокус на первый пустой input
            const inputs = container.querySelectorAll('.hard-test-input');
            for (let input of inputs) {
                if (!input.value) {
                    input.focus();
                    break;
                }
            }
        }

        /**
         * Сохранение ответа пользователя
         */
        function saveHardTestAnswer(index, value) {
            hardTestAnswers[index] = value.trim();
        }

        /**
         * Обновление индикатора страницы
         */
        function updateHardTestPageIndicator() {
            const indicator = document.getElementById('hardTestPageIndicator');
            const pageNumbers = document.getElementById('hardTestPageNumbers');
            const prevBtn = document.getElementById('hardTestPrevBtn');
            const nextBtn = document.getElementById('hardTestNextBtn');

            indicator.textContent = `Страница ${hardTestCurrentPage + 1} из ${hardTestTotalPages}`;
            pageNumbers.textContent = `${hardTestCurrentPage + 1} / ${hardTestTotalPages}`;

            // Управление кнопками навигации
            prevBtn.disabled = hardTestCurrentPage === 0;
            prevBtn.style.opacity = hardTestCurrentPage === 0 ? '0.5' : '1';

            nextBtn.disabled = hardTestCurrentPage === hardTestTotalPages - 1;
            nextBtn.style.opacity = hardTestCurrentPage === hardTestTotalPages - 1 ? '0.5' : '1';
        }

        /**
         * Переход на предыдущую страницу
         */
        function hardTestPrevPage() {
            if (hardTestCurrentPage > 0) {
                hardTestCurrentPage--;
                renderHardTestPage();
                updateHardTestPageIndicator();
            }
        }

        /**
         * Переход на следующую страницу
         */
        function hardTestNextPage() {
            if (hardTestCurrentPage < hardTestTotalPages - 1) {
                hardTestCurrentPage++;
                renderHardTestPage();
                updateHardTestPageIndicator();
            }
        }

        /**
         * Выход из hard-теста
         */
        function exitHardTest() {
            if (confirm('Выйти из теста? Прогресс не будет сохранён.')) {
                stopHardTestTimer();
                showCategoryMenu(currentCategory);
            }
        }

        /**
         * Отправка теста на проверку — показывает модальное окно подтверждения
         */
        function hardTestSubmit() {
            // Показываем красивое модальное окно подтверждения
            document.getElementById('hardTestConfirmModal').classList.remove('hidden');
        }

        /**
         * Подтверждение — Да
         */
        function hardTestConfirmYes() {
            // Скрываем модальное окно
            document.getElementById('hardTestConfirmModal').classList.add('hidden');

            // Останавливаем таймер
            stopHardTestTimer();

            // Проверяем ответы
            const results = checkHardTestAnswers();

            // Показываем результаты
            showHardTestResults(results);
        }

        /**
         * Подтверждение — Нет
         */
        function hardTestConfirmNo() {
            // Просто скрываем модальное окно
            document.getElementById('hardTestConfirmModal').classList.add('hidden');
        }

        /**
         * Проверка ответов
         * @returns {Object} { correct, wrong, total, percentage, details }
         */
        function checkHardTestAnswers() {
            let correct = 0;
            let wrong = 0;
            const details = []; // Детали по каждому вопросу

            hardTestQuestions.forEach((q, index) => {
                const userAnswer = (hardTestAnswers[index] || '').trim().toLowerCase();
                const correctAnswer = q.answer.toLowerCase();

                const isCorrect = userAnswer === correctAnswer;

                if (isCorrect) {
                    correct++;
                } else {
                    wrong++;
                }

                details.push({
                    index: index,
                    sentence: q.sentence,
                    userAnswer: hardTestAnswers[index] || '',
                    correctAnswer: q.word.spanish,
                    isCorrect: isCorrect
                });
            });

            const total = hardTestQuestions.length;
            const percentage = Math.round((correct / total) * 100);

            return { correct, wrong, total, percentage, details };
        }

        /**
         * Показ результатов теста
         * @param {Object} results - результаты проверки
         */
        function showHardTestResults(results) {
            const { correct, wrong, total, percentage, details } = results;
            const passed = percentage >= 80;

            // Сохраняем прогресс если прошёл (≥80%)
            if (passed) {
                saveHardTestProgress(percentage);
            }

            // Показываем экран результатов
            hideAll();
            showUserBadge();
            document.getElementById('hardTestResultsScreen').classList.remove('hidden');

            // Статус
            const statusEl = document.getElementById('hardTestResultStatus');
            if (passed) {
                statusEl.innerHTML = '✅ ЗАЧЁТ!';
                statusEl.style.color = '#27ae60';
            } else {
                statusEl.innerHTML = '❌ НЕ ЗАЧЁТ';
                statusEl.style.color = '#e74c3c';
            }

            // Статистика
            document.getElementById('hardTestResultCorrect').textContent = correct;
            document.getElementById('hardTestResultWrong').textContent = wrong;
            document.getElementById('hardTestResultPercent').textContent = percentage + '%';

            // Детали с подсветкой
            const detailsContainer = document.getElementById('hardTestResultDetails');
            let detailsHtml = '';

            details.forEach((item, idx) => {
                const bgColor = item.isCorrect
                    ? 'rgba(39, 174, 96, 0.2)'
                    : 'rgba(231, 76, 60, 0.2)';
                const borderColor = item.isCorrect
                    ? 'rgba(39, 174, 96, 0.5)'
                    : 'rgba(231, 76, 60, 0.5)';

                // Заменяем ___ на ответ пользователя с подсветкой
                let sentenceWithAnswer = item.sentence;
                if (item.isCorrect) {
                    sentenceWithAnswer = item.sentence.replace('___',
                        `<span style="color: #27ae60; font-weight: bold; border-bottom: 2px solid #27ae60;">${item.correctAnswer}</span>`
                    );
                } else {
                    const userPart = item.userAnswer
                        ? `<span style="color: #e74c3c; text-decoration: line-through;">${item.userAnswer}</span> → `
                        : '';
                    sentenceWithAnswer = item.sentence.replace('___',
                        `${userPart}<span style="color: #27ae60; font-weight: bold;">${item.correctAnswer}</span>`
                    );
                }

                detailsHtml += `
                    <div style="
                        background: ${bgColor};
                        border: 1px solid ${borderColor};
                        border-radius: 10px;
                        padding: 12px 15px;
                        margin-bottom: 10px;
                    ">
                        <span style="
                            background: ${item.isCorrect ? 'rgba(39, 174, 96, 0.3)' : 'rgba(231, 76, 60, 0.3)'};
                            color: ${item.isCorrect ? '#27ae60' : '#e74c3c'};
                            font-weight: bold;
                            padding: 2px 8px;
                            border-radius: 50%;
                            margin-right: 10px;
                            font-size: 0.9em;
                        ">${idx + 1}</span>
                        <span style="color: #2c3e50; font-size: 1.1em;">${sentenceWithAnswer}</span>
                    </div>
                `;
            });

            detailsContainer.innerHTML = detailsHtml;
        }

        /**
         * Повторить hard-тест
         */
        function retryHardTest() {
            const words = vocabularyData[currentUnidad].groups[currentCategory];
            startHardTestAllQuestions(words);
        }

        /**
         * Вернуться к категории из результатов hard-теста
         */
        function backToCategoryFromHardTest() {
            showCategoryMenu(currentCategory);
        }

        /**
         * Сохранение прогресса hard-теста
         */
        function saveHardTestProgress(percentage) {
            const profile = getActiveProfile();
            if (!profile) return;

            // Убеждаемся что структура progress существует
            ensureProgressSkeleton(profile);

            // Сохраняем результат для текущей категории
            if (!profile.progress[currentUnidad].palabras) {
                profile.progress[currentUnidad].palabras = {};
            }

            // Обновляем только если новый результат лучше
            const currentScore = profile.progress[currentUnidad].palabras[currentCategory] || 0;
            if (percentage > currentScore) {
                profile.progress[currentUnidad].palabras[currentCategory] = percentage;
            }

            // Сохраняем в localStorage
            const state = loadAppState();
            state.profiles[profile.id] = profile;
            saveAppState(state);
        }

        // ═══════════════════════════════════════════════════════════════
        // CARD MATCHING GAME SYSTEM (Pair Matching with Icons)
        // ═══════════════════════════════════════════════════════════════

        let leftWords = [];   // Russian words
        let rightWords = [];  // Spanish words (including 2 decoys)
        let selectedLeft = null;   // Index of selected left card
        let selectedRight = null;  // Index of selected right card
        let firstClickSide = null; // Which side was clicked first ('left' or 'right')
        let matchedPairs = new Set();  // Indices of matched left words
        let correctMatches = 0;   // Count of correct matches
        let isAnimating = false;  // Prevent clicks during animation

        function startCardMatchingGame() {
            if (!currentUnidad || !currentCategory) {
                console.error('startCardMatchingGame called without currentUnidad or currentCategory');
                return;
            }

            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData || !unidadData.groups || !unidadData.groups[currentCategory]) {
                alert('Ошибка: данные группы не загружены');
                return;
            }

            const groupWords = unidadData.groups[currentCategory];
            const groupSize = groupWords.length;

            // Проверяем что группа подходит для Card Matching (<10 слов)
            if (groupSize >= 10) {
                alert('Эта группа слишком большая для Card Matching Game. Используйте обычные тесты.');
                return;
            }

            // Генерируем засланцев (2 испанских слова из других групп)
            const decoyWords = generateDecoyWords(currentCategory, 2);

            // LEFT: русские слова (перемешиваем)
            leftWords = shuffleArray([...groupWords]);

            // RIGHT: испанские слова + 2 засланца (перемешиваем)
            rightWords = shuffleArray([...groupWords, ...decoyWords]);

            // Сброс состояния
            selectedLeft = null;
            selectedRight = null;
            matchedPairs = new Set();
            correctMatches = 0;
            isAnimating = false;

            // Показываем экран (отдельный, не внутри Palabras menu!)
            hideAll();
            showUserBadge();
            document.getElementById('cardMatchingScreen').classList.remove('hidden');

            // Обновляем заголовок
            const displayName = currentCategory.replace(/_/g, ' ');
            document.getElementById('cardMatchingTitle').textContent = `🃏 ${displayName}`;
            document.getElementById('cardMatchingSubtitle').textContent =
                `Сопоставьте пары: русское слово ↔ испанское слово`;

            // Рендерим две колонки карт
            renderPairMatchingCards();

            saveNavigationState('cardMatchingScreen');
        }

        function generateDecoyWords(excludeGroup, count) {
            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData || !unidadData.groups) return [];

            const allOtherWords = [];
            Object.keys(unidadData.groups).forEach(groupName => {
                if (groupName !== excludeGroup) {
                    allOtherWords.push(...unidadData.groups[groupName]);
                }
            });

            // Перемешиваем и берем нужное количество
            const shuffled = shuffleArray([...allOtherWords]);
            return shuffled.slice(0, count);
        }

        function shuffleArray(array) {
            const newArray = [...array];
            for (let i = newArray.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
            }
            return newArray;
        }

        function renderPairMatchingCards() {
            const leftContainer = document.getElementById('leftColumn');
            const rightContainer = document.getElementById('rightColumn');

            leftContainer.innerHTML = '';
            rightContainer.innerHTML = '';

            // Render LEFT column (Russian words)
            leftWords.forEach((word, index) => {
                const card = createCard(word, index, 'left');
                leftContainer.appendChild(card);
            });

            // Render RIGHT column (Spanish words)
            rightWords.forEach((word, index) => {
                const card = createCard(word, index, 'right');
                rightContainer.appendChild(card);
            });
        }

        function createCard(word, index, side) {
            const card = document.createElement('div');
            card.className = `matching-card ${side}`;
            card.id = `${side}-${index}`;
            card.dataset.side = side;
            card.dataset.index = index;

            // Card inner wrapper for 3D flip
            const inner = document.createElement('div');
            inner.className = 'card-inner';

            // Card front (shows text)
            const front = document.createElement('div');
            front.className = 'card-front';
            front.innerHTML = `
                <div class="card-text">
                    ${side === 'left' ? word.ru : word.spanish}
                </div>
            `;

            // Card back (shows icon)
            const back = document.createElement('div');
            back.className = 'card-back';

            // Get Phosphor icon
            const iconName = word.icon || 'question';
            back.innerHTML = `
                <i class="ph ph-${iconName}" style="font-size: 48px;"></i>
                <div style="margin-top: 10px; font-size: 0.9em;">${side === 'left' ? word.ru : word.spanish}</div>
            `;

            inner.appendChild(front);
            inner.appendChild(back);
            card.appendChild(inner);

            card.onclick = () => selectCard(side, index);

            return card;
        }

        function selectCard(side, index) {
            if (isAnimating) return; // Prevent clicks during animation

            const card = document.getElementById(`${side}-${index}`);
            if (!card) return;

            // Check if already matched
            const leftIdx = side === 'left' ? index : selectedLeft;
            if (leftIdx !== null && matchedPairs.has(leftIdx)) return;

            if (side === 'left') {
                // Deselect previous left card
                if (selectedLeft !== null) {
                    const prevCard = document.getElementById(`left-${selectedLeft}`);
                    if (prevCard) prevCard.classList.remove('selected');
                }

                // Select new left card
                selectedLeft = index;
                card.classList.add('selected');

                // Remember first click side if nothing selected yet
                if (selectedRight === null && firstClickSide === null) {
                    firstClickSide = 'left';
                }

                // If right card already selected, check pair
                if (selectedRight !== null) {
                    checkPair();
                }
            } else { // right side
                // Deselect previous right card
                if (selectedRight !== null) {
                    const prevCard = document.getElementById(`right-${selectedRight}`);
                    if (prevCard) prevCard.classList.remove('selected');
                }

                // Select new right card
                selectedRight = index;
                card.classList.add('selected');

                // Remember first click side if nothing selected yet
                if (selectedLeft === null && firstClickSide === null) {
                    firstClickSide = 'right';
                }

                // If left card already selected, check pair
                if (selectedLeft !== null) {
                    checkPair();
                }
            }
        }

        function checkPair() {
            if (selectedLeft === null || selectedRight === null) return;

            isAnimating = true;

            const leftWord = leftWords[selectedLeft];
            const rightWord = rightWords[selectedRight];

            let leftCard = document.getElementById(`left-${selectedLeft}`);
            let rightCard = document.getElementById(`right-${selectedRight}`);

            // Flip cards and show icons
            flipCard(leftCard, true);
            flipCard(rightCard, true);

            // Check if icons match (same word)
            const isMatch = leftWord.spanish === rightWord.spanish && leftWord.ru === rightWord.ru;

            setTimeout(() => {
                if (isMatch) {
                    // Correct match - green fade away
                    leftCard.classList.add('correct');
                    rightCard.classList.add('correct');

                    matchedPairs.add(selectedLeft);
                    correctMatches++;

                    setTimeout(() => {
                        // Плавное исчезновение + схлопывание (гравитация вверх!)
                        const leftInner = leftCard.querySelector('.card-inner');
                        const rightInner = rightCard.querySelector('.card-inner');

                        leftCard.style.opacity = '0';
                        rightCard.style.opacity = '0';
                        leftCard.style.maxHeight = '0';
                        rightCard.style.maxHeight = '0';
                        leftCard.style.minHeight = '0';
                        rightCard.style.minHeight = '0';
                        leftCard.style.margin = '0';
                        rightCard.style.margin = '0';

                        // Apply to .card-inner (has padding and border)
                        leftInner.style.padding = '0';
                        rightInner.style.padding = '0';
                        leftInner.style.border = 'none';
                        rightInner.style.border = 'none';

                        selectedLeft = null;
                        selectedRight = null;
                        firstClickSide = null; // Reset first click
                        isAnimating = false;

                        // Check if game finished
                        if (matchedPairs.size === leftWords.length) {
                            finishGame();
                        }
                    }, 1000); // Wait 1s before fading
                } else {
                    // Wrong match - show red
                    leftCard.classList.add('incorrect');
                    rightCard.classList.add('incorrect');

                    setTimeout(() => {
                        // ПРОВЕРКА: является ли rightWord засланцем?
                        const isRightCardDecoy = !leftWords.some(w =>
                            w.spanish === rightWord.spanish && w.ru === rightWord.ru
                        );

                        if (isRightCardDecoy) {
                            // rightCard - это ЗАСЛАНЕЦ! Удаляем ТОЛЬКО его
                            const rightInner = rightCard.querySelector('.card-inner');

                            rightCard.style.opacity = '0';
                            rightCard.style.maxHeight = '0';
                            rightCard.style.minHeight = '0';
                            rightCard.style.margin = '0';
                            rightInner.style.padding = '0';
                            rightInner.style.border = 'none';

                            // Убираем красный с leftCard и оставляем её
                            leftCard.classList.remove('incorrect', 'selected');
                            flipCard(leftCard, false);

                        } else {
                            // Обычная неправильная пара - удаляем leftCard + её правильную пару
                            matchedPairs.add(selectedLeft); // Mark left as used (but incorrect)

                            // Найти ПРАВИЛЬНУЮ пару для leftWord
                            const correctRightIndex = rightWords.findIndex(w =>
                                w.spanish === leftWord.spanish && w.ru === leftWord.ru
                            );

                            if (correctRightIndex !== -1) {
                                const correctRightCard = document.getElementById(`right-${correctRightIndex}`);

                                // Удаляем leftCard + правильную rightCard
                                const leftInner = leftCard.querySelector('.card-inner');
                                const correctRightInner = correctRightCard.querySelector('.card-inner');

                                // Fade out left card
                                leftCard.style.opacity = '0';
                                leftCard.style.maxHeight = '0';
                                leftCard.style.minHeight = '0';
                                leftCard.style.margin = '0';
                                leftInner.style.padding = '0';
                                leftInner.style.border = 'none';

                                // Fade out CORRECT right card
                                correctRightCard.style.opacity = '0';
                                correctRightCard.style.maxHeight = '0';
                                correctRightCard.style.minHeight = '0';
                                correctRightCard.style.margin = '0';
                                correctRightInner.style.padding = '0';
                                correctRightInner.style.border = 'none';

                                // УБИРАЕМ красный с неправильной rightCard и оставляем её
                                rightCard.classList.remove('incorrect', 'selected');
                                flipCard(rightCard, false);
                            }
                        }

                        selectedLeft = null;
                        selectedRight = null;
                        firstClickSide = null;
                        isAnimating = false;

                        // Check if game finished
                        if (matchedPairs.size === leftWords.length) {
                            finishGame();
                        }
                    }, 1000); // Wait 1s before fading
                }
            }, 600); // Wait for flip animation
        }

        function flipCard(card, showBack) {
            // Simply toggle the flipped class - CSS handles the 3D rotation
            if (showBack) {
                card.classList.add('flipped');
            } else {
                card.classList.remove('flipped');
            }
        }

        function finishGame() {
            const totalPairs = leftWords.length;
            const percentage = Math.round((correctMatches / totalPairs) * 100);

            // Save progress - используем систему updateProgress
            updateProgress(currentUnidad, currentCategory, 'easy', percentage);

            // Update UI
            updateCategoryButtons();
            updateUnidadProgressBars();
            updateUnidadUI();

            // Show results screen
            setTimeout(() => {
                hideAll();
                showUserBadge();
                document.getElementById('cardMatchingResultsScreen').classList.remove('hidden');

                const displayName = currentCategory.replace(/_/g, ' ');

                document.getElementById('cardMatchingResultTitle').textContent =
                    percentage >= 80 ? '🎉 Отлично!' : '👍 Хорошая попытка!';

                document.getElementById('cardMatchingStats').textContent =
                    `Правильных пар: ${correctMatches} из ${totalPairs}`;

                document.getElementById('cardMatchingGrade').textContent = `${percentage}%`;
                document.getElementById('cardMatchingGrade').style.color =
                    percentage >= 80 ? '#27ae60' : percentage >= 60 ? '#f39c12' : '#e74c3c';

                document.getElementById('cardMatchingBreakdown').innerHTML = `
                    <div style="background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.3); padding: 20px; border-radius: 10px;">
                        <h3 style="margin-top: 0; color: #333;">📊 Результат:</h3>
                        <p style="color: #27ae60; margin: 10px 0;">
                            ✓ Правильно: <strong>${correctMatches}</strong> из ${totalPairs}
                        </p>
                        <p style="color: #333; margin: 10px 0;">
                            Процент: <strong>${percentage}%</strong>
                        </p>
                    </div>
                `;

                // Показываем/скрываем кнопку "Следующий тест"
                const nextTestBtn = document.getElementById('nextTestBtn');
                if (nextTestBtn) {
                    nextTestBtn.style.display = hasNextTest() ? 'inline-block' : 'none';
                }

                saveNavigationState('cardMatchingResultsScreen');
            }, 1500);
        }

        function retryCardMatching() {
            startCardMatchingGame();
        }

        function exitCardMatching() {
            // Return to Palabras menu (group selection), not category menu
            showPalabrasMenu();
        }

        // Переход к следующему тесту (следующий уровень или следующая группа)
        function goToNextTest() {
            if (!currentUnidad || !currentCategory) return;

            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData || !unidadData.groups) return;

            const groupSize = unidadData.groups[currentCategory]?.length || 0;

            // Для групп 10+ слов - проверяем следующий уровень
            if (groupSize >= 10 && currentLevel) {
                const levels = ['easy', 'medium', 'hard'];
                const currentLevelIndex = levels.indexOf(currentLevel);

                if (currentLevelIndex >= 0 && currentLevelIndex < levels.length - 1) {
                    // Есть следующий уровень - запускаем его
                    const nextLevel = levels[currentLevelIndex + 1];
                    startTest(nextLevel);
                    return;
                }
            }

            // Если уровней больше нет или это Card Matching - переходим к следующей группе
            const groupNames = Object.keys(unidadData.groups);
            const currentIndex = groupNames.indexOf(currentCategory);

            if (currentIndex >= 0 && currentIndex < groupNames.length - 1) {
                const nextGroup = groupNames[currentIndex + 1];
                showCategoryMenu(nextGroup);
            }
        }

        // Проверка, есть ли следующий тест (уровень или группа)
        function hasNextTest() {
            if (!currentUnidad || !currentCategory) return false;

            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData || !unidadData.groups) return false;

            const groupSize = unidadData.groups[currentCategory]?.length || 0;

            // Для групп 10+ слов - проверяем есть ли следующий уровень
            if (groupSize >= 10 && currentLevel) {
                const levels = ['easy', 'medium', 'hard'];
                const currentLevelIndex = levels.indexOf(currentLevel);

                if (currentLevelIndex >= 0 && currentLevelIndex < levels.length - 1) {
                    return true; // Есть следующий уровень
                }
            }

            // Проверяем есть ли следующая группа
            const groupNames = Object.keys(unidadData.groups);
            const currentIndex = groupNames.indexOf(currentCategory);

            return currentIndex >= 0 && currentIndex < groupNames.length - 1;
        }

        // ═══════════════════════════════════════════════════════════════
        // VERB CONJUGATION SYSTEM
        // ═══════════════════════════════════════════════════════════════

        const verbs = {
            presente: [
                { infinitive: "hablar", conjugations: ["hablo", "hablas", "habla", "hablamos", "habláis", "hablan"] },
                { infinitive: "comer", conjugations: ["como", "comes", "come", "comemos", "coméis", "comen"] },
                { infinitive: "vivir", conjugations: ["vivo", "vives", "vive", "vivimos", "vivís", "viven"] }
            ],
            preterito: [
                { infinitive: "hablar", conjugations: ["hablé", "hablaste", "habló", "hablamos", "hablasteis", "hablaron"] },
                { infinitive: "comer", conjugations: ["comí", "comiste", "comió", "comimos", "comisteis", "comieron"] },
                { infinitive: "vivir", conjugations: ["viví", "viviste", "vivió", "vivimos", "vivisteis", "vivieron"] }
            ]
        };

        const pronouns = ["yo", "tú", "él/ella", "nosotros", "vosotros", "ellos/ellas"];
        let currentVerb = null;
        let currentTense = null;

        function showVerbMenu() {
            hideAll();
            showUserBadge();
            document.getElementById('verbMenu').classList.remove('hidden');
        }

        function startVerbPractice(tense) {
            currentTense = tense;
            hideAll();
            showUserBadge();
            document.getElementById('verbPracticeScreen').classList.remove('hidden');

            const titles = {
                presente: 'Практика настоящего времени',
                preterito: 'Практика прошедшего времени'
            };
            document.getElementById('verbPracticeTitle').textContent = titles[tense];

            nextVerb();
        }

        function nextVerb() {
            const verbList = verbs[currentTense];
            currentVerb = verbList[Math.floor(Math.random() * verbList.length)];

            document.getElementById('currentVerb').textContent = currentVerb.infinitive;
            document.getElementById('verbPracticeSubtitle').innerHTML = 
                `Проспрягайте глагол: <strong>${currentVerb.infinitive}</strong>`;

            const grid = document.getElementById('conjugationGrid');
            grid.innerHTML = '';

            pronouns.forEach((pronoun, i) => {
                const item = document.createElement('div');
                item.className = 'conjugation-item';
                item.innerHTML = `
                    <div class="pronoun">${pronoun}</div>
                    <input type="text" class="conjugation-input" data-index="${i}" placeholder="...">
                `;
                grid.appendChild(item);
            });
        }

        function checkConjugations() {
            const inputs = document.querySelectorAll('.conjugation-input');
            let correct = 0;

            inputs.forEach((input, i) => {
                const userAnswer = input.value.trim().toLowerCase();
                const correctAnswer = currentVerb.conjugations[i].toLowerCase();

                if (userAnswer === correctAnswer) {
                    input.classList.add('correct');
                    input.classList.remove('incorrect');
                    correct++;
                } else {
                    input.classList.add('incorrect');
                    input.classList.remove('correct');
                    input.value = currentVerb.conjugations[i];
                }
            });

            alert(`Вы ответили правильно на ${correct} из ${pronouns.length}!`);
        }

        // ═══════════════════════════════════════════════════════════════
        // QA DEVELOPER MODE
        // ═══════════════════════════════════════════════════════════════

        function showQADeveloperMode() {
            hideAll();
            showUserBadge();
            document.getElementById('qaScreen').classList.remove('hidden');
        }

        function unlockAllUnidades() {
            const profile = getActiveProfile();
            if (!profile) {
                alert('Нет активного профиля');
                return;
            }

            // Динамическая разблокировка всех unidades (кроме первой, которая всегда открыта)
            UNIDADES.slice(1).forEach(unidad => {
                profile.unlocks[unidad] = true;
            });

            const state = loadAppState();
            state.profiles[profile.id] = profile;
            saveAppState(state);

            updateUnidadUI();
            document.getElementById('qaOutput').textContent = '✅ Все Unidades разблокированы!';
        }

        function unlockAllPalabrasTests() {
            __qaUnlockAllTests = !__qaUnlockAllTests;
            updateCategoryButtons();

            const status = __qaUnlockAllTests ? 'разблокированы' : 'заблокированы';
            const icon = __qaUnlockAllTests ? '✅' : '🔒';
            document.getElementById('qaOutput').textContent = `${icon} Все тесты Palabras ${status}! (Medium и Hard ${__qaUnlockAllTests ? 'доступны' : 'требуют прохождения предыдущих уровней'})`;
        }

        function resetProgress() {
            const profile = getActiveProfile();
            if (!profile) {
                alert('Нет активного профиля');
                return;
            }

            if (!confirm('Сбросить ВЕСЬ прогресс для этого профиля?')) return;

            ensureProgressSkeleton(profile);

            // Динамический сброс прогресса для всех 10 unidades
            UNIDADES.forEach(unidad => {
                // Сброс всех групп (динамически)
                const unidadData = vocabularyData[unidad];
                if (unidadData && unidadData.groups) {
                    Object.keys(unidadData.groups).forEach(groupName => {
                        profile.progress[unidad][groupName] = {
                            easy10: 0, easy25: 0,
                            medium10: 0, medium25: 0,
                            hard10: 0, hard25: 0
                        };
                    });
                }
                // Reset exercises progress
                profile.progress[unidad].ejercicios = {};
            });

            // Динамическая генерация unlocks (все заблокированы кроме первой)
            profile.unlocks = Object.fromEntries(
                UNIDADES.slice(1).map(u => [u, false])
            );

            const state = loadAppState();
            state.profiles[profile.id] = profile;
            saveAppState(state);

            updateUnidadUI();
            document.getElementById('qaOutput').textContent = '✅ Прогресс сброшен!';
        }

        function fillProgress() {
            const profile = getActiveProfile();
            if (!profile) {
                alert('Нет активного профиля');
                return;
            }

            ensureProgressSkeleton(profile);

            // Динамическое заполнение прогресса для всех 10 unidades
            UNIDADES.forEach(unidad => {
                // Заполнение всех групп (динамически)
                const unidadData = vocabularyData[unidad];
                if (unidadData && unidadData.groups) {
                    Object.keys(unidadData.groups).forEach(groupName => {
                        profile.progress[unidad][groupName] = {
                            easy10: 100, easy25: 100,
                            medium10: 100, medium25: 100,
                            hard10: 100, hard25: 100
                        };
                    });
                }
                // Fill exercises progress
                if (unidadData && unidadData.ejercicios) {
                    unidadData.ejercicios.forEach(exercise => {
                        profile.progress[unidad].ejercicios[exercise.id] = 100;
                    });
                }
            });

            // Динамическая генерация unlocks (все разблокированы кроме первой)
            profile.unlocks = Object.fromEntries(
                UNIDADES.slice(1).map(u => [u, true])
            );

            const state = loadAppState();
            state.profiles[profile.id] = profile;
            saveAppState(state);

            updateUnidadUI();
            document.getElementById('qaOutput').textContent = '✅ Прогресс заполнен до 100%!';
        }

        function viewLocalStorage() {
            const state = loadAppState();
            document.getElementById('qaOutput').textContent = JSON.stringify(state, null, 2);
        }
async function saveNavigationState(screenId) {
    // ВСЕГДА сохраняем в localStorage
    const navState = {
        screen_id: screenId,
        current_unidad: currentUnidad,
        current_category: currentCategory
    };
    localStorage.setItem('navigation_state', JSON.stringify(navState));

    // Дополнительно синхронизируем с бэкендом если включено
    if (!ENABLE_BACKEND_SYNC) return;

    const token = getToken();
    if (!token) return;

    try {
        await fetch(API_URL + '/navigation-state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(navState)
        });
    } catch (e) {
        console.error('Failed to save navigation state:', e);
    }
}
// Синхронизация прогресса на бекенд
async function syncProgressToBackend() {
    if (!ENABLE_BACKEND_SYNC) return; // Пропускаем, если бэкенд отключён

    const token = getToken();
    if (!token) return;

    const state = loadAppState();
    try {
        await fetch(API_URL + '/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                data: JSON.stringify(state)
            })
        });
        console.log('✅ Прогресс синхронизирован с бекендом');
    } catch (e) {
        console.error('❌ Ошибка синхронизации прогресса:', e);
    }
}

// Загрузка прогресса с бекенда
async function loadProgressFromBackend() {
    if (!ENABLE_BACKEND_SYNC) return null; // Пропускаем, если бэкенд отключён

    const token = getToken();
    if (!token) return null;

    try {
        const res = await fetch(API_URL + '/progress', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        if (!res.ok) return null;
        const result = await res.json();
        if (result && result.data) {
            return JSON.parse(result.data);
        }
        return null;
    } catch (e) {
        console.error('❌ Ошибка загрузки прогресса:', e);
        return null;
    }
}

async function getNavigationState() {
    if (!ENABLE_BACKEND_SYNC) return null; // Пропускаем, если бэкенд отключён

    const token = getToken();
    if (!token) return null;

    try {
        const res = await fetch(API_URL + '/navigation-state', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error('Failed to get navigation state:', e);
        return null;
    }
}


        function runQATestsV3() {
            let output = '🧪 Запуск QA тестов...\n\n';
            
            const profile = getActiveProfile();
            if (profile) {
                output += `✅ Активный профиль: ${profile.nickname}\n`;
                output += `✅ ID профиля: ${profile.id}\n`;
                output += `✅ Прогресс загружен успешно\n`;
            } else {
                output += '❌ Нет активного профиля\n';
            }

            const state = loadAppState();
            output += `\n📊 Всего профилей: ${Object.keys(state.profiles).length}\n`;

            document.getElementById('qaOutput').textContent = output;
        }
	async function loadUnidadFromJson(filename) {
  try {
    const res = await fetch(`data/${filename}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const unidad = await res.json();

    // Проверка структуры JSON
    if (!unidad || !unidad.id || !unidad.groups) {
      throw new Error("Неверная структура JSON - отсутствуют обязательные поля (id, groups)");
    }

    // Проверка наличия групп
    const groupCount = Object.keys(unidad.groups).length;
    if (groupCount === 0) {
      console.warn(`⚠️ ${filename}: нет групп словаря`);
    }

    // Сохраняем полный объект unidad (groups + ejercicios)
    vocabularyData[unidad.id] = unidad;
    console.log(`✅ Загружен: ${filename} → ${unidad.id} (${groupCount} групп, ${unidad.ejercicios?.length || 0} упражнений)`);

  } catch (e) {
    console.error(`❌ ОШИБКА загрузки ${filename}:`, e.message);
    // Не показываем alert при загрузке, чтобы не мешать пользователю
    // Ошибка будет показана при попытке использовать данные
  }
}

        // ═══════════════════════════════════════════════════════════════
        // EXAM SYSTEM - Question Generation
        // ═══════════════════════════════════════════════════════════════

        function generatePalabrasQuestions() {
            console.log('🔵 generatePalabrasQuestions() вызвана для', currentUnidad);
            const palabrasQuestions = [];

            if (!currentUnidad) {
                console.log('❌ Нет currentUnidad');
                return [];
            }

            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData || !unidadData.groups) {
                console.log('❌ Нет данных для', currentUnidad);
                return [];
            }

            console.log(`✅ ${currentUnidad} имеет groups:`, Object.keys(unidadData.groups));

            // Берём ВСЕ semantic groups из ТЕКУЩЕЙ Unidad
            Object.keys(unidadData.groups).forEach(groupName => {
                const words = unidadData.groups[groupName];

                // Вычисляем 30% от количества слов в группе (округление вверх)
                const count = Math.ceil(words.length * EXAM_PALABRAS_PERCENTAGE);

                // Перемешиваем слова и берём нужное количество
                const shuffledWords = shuffleArray(words);
                const selectedWords = shuffledWords.slice(0, count);

                // Для каждого выбранного слова создаём вопрос
                selectedWords.forEach(word => {
                    // Проверяем наличие hardSentences
                    if (word.hardSentences && word.hardSentences.length > 0) {
                        // Выбираем случайное предложение из 4 (или сколько есть)
                        const randomIndex = Math.floor(Math.random() * word.hardSentences.length);
                        const sentence = word.hardSentences[randomIndex];

                        palabrasQuestions.push({
                            type: 'palabra',
                            group: groupName,
                            unidad: currentUnidad,
                            sentence: sentence,
                            correctAnswer: word.spanish,
                            ru: word.ru
                        });
                    }
                });
            });

            console.log(`📊 generatePalabrasQuestions() вернула ${palabrasQuestions.length} вопросов`);
            return palabrasQuestions;
        }

        function generateEjerciciosQuestions() {
            console.log('🔵 generateEjerciciosQuestions() вызвана для', currentUnidad);
            const ejerciciosQuestions = [];

            if (!currentUnidad) {
                console.log('❌ Нет currentUnidad');
                return [];
            }

            const unidadData = vocabularyData[currentUnidad];
            if (!unidadData || !unidadData.ejercicios) {
                console.log('❌ Нет ejercicios для', currentUnidad);
                return [];
            }

            // Берём ВСЕ ejercicios из ТЕКУЩЕЙ Unidad
            unidadData.ejercicios.forEach(ejercicio => {
                if (ejercicio.questions && ejercicio.questions.length > 0) {
                    // Вычисляем 30% от количества вопросов (округление вверх)
                    const count = Math.ceil(ejercicio.questions.length * EXAM_EJERCICIOS_PERCENTAGE);

                    // Перемешиваем вопросы и берём нужное количество
                    const shuffledQuestions = shuffleArray(ejercicio.questions);
                    const selectedQuestions = shuffledQuestions.slice(0, count);

                    // Для каждого выбранного вопроса создаём объект
                    selectedQuestions.forEach(question => {
                        ejerciciosQuestions.push({
                            type: 'ejercicio',
                            exerciseId: ejercicio.id,
                            exerciseTitle: ejercicio.title,
                            unidad: currentUnidad,
                            sentence: question.sentence,
                            correctAnswer: question.answer,
                            hint: ejercicio.hint || ''
                        });
                    });
                }
            });

            console.log(`📊 generateEjerciciosQuestions() вернула ${ejerciciosQuestions.length} вопросов`);
            return ejerciciosQuestions;
        }

        function generateExamQuestions() {
            // Генерируем вопросы Palabras
            const palabrasQuestions = generatePalabrasQuestions();

            // Генерируем вопросы Ejercicios
            const ejerciciosQuestions = generateEjerciciosQuestions();

            // Объединяем: СНАЧАЛА Palabras, ПОТОМ Ejercicios (БЕЗ перемешивания)
            const allQuestions = [...palabrasQuestions, ...ejerciciosQuestions];

            console.log(`📊 Экзамен сгенерирован: ${palabrasQuestions.length} Palabras + ${ejerciciosQuestions.length} Ejercicios = ${allQuestions.length} вопросов`);

            return allQuestions;
        }

        // ═══════════════════════════════════════════════════════════════
        // EXAM SYSTEM - Exam Logic
        // ═══════════════════════════════════════════════════════════════

        function startExam() {
            console.log('🔵 startExam() вызвана');

            const profile = getActiveProfile();
            console.log('Profile:', profile);

            if (!profile) {
                alert('❌ Нет активного профиля');
                console.log('❌ Профиль не найден!');
                return;
            }

            console.log('Генерируем вопросы экзамена...');
            console.log('vocabularyData:', vocabularyData);

            // Генерируем вопросы
            examQuestions = generateExamQuestions();

            console.log(`Сгенерировано вопросов: ${examQuestions.length}`);
            console.log('examQuestions:', examQuestions);

            if (examQuestions.length === 0) {
                alert('❌ Ошибка: не удалось сгенерировать вопросы для экзамена');
                console.error('❌ examQuestions пустой! Проверь vocabularyData');
                return;
            }

            // Инициализируем состояние экзамена
            examCurrentIndex = 0;
            examScore = 0;
            examAnswers = [];
            examStartTime = Date.now();

            // Показываем экран экзамена
            hideAll();
            document.getElementById('examScreen').classList.remove('hidden');

            console.log(`🎓 Экзамен начат! ${examQuestions.length} вопросов`);

            // Показываем первый вопрос
            showExamQuestion();
        }

        function showExamQuestion() {
            if (examCurrentIndex >= examQuestions.length) {
                // Экзамен завершён - показываем результаты
                showExamResults();
                return;
            }

            const question = examQuestions[examCurrentIndex];

            // Обновляем прогресс
            document.getElementById('examProgress').textContent =
                `Вопрос ${examCurrentIndex + 1} из ${examQuestions.length}`;

            // Обновляем индикатор секции
            let sectionText = '';
            if (question.type === 'palabra') {
                sectionText = `Palabras - ${question.group}`;
            } else if (question.type === 'ejercicio') {
                sectionText = `Ejercicios - ${question.exerciseTitle}`;
            }
            document.getElementById('examSectionName').textContent = sectionText;

            // Показываем вопрос
            document.getElementById('examQuestionText').textContent = question.sentence;

            // Подсказки отключены
            const hintElement = document.getElementById('examCategoryHint');
            hintElement.style.display = 'none';

            // Очищаем поле ввода
            const inputElement = document.getElementById('examAnswerInput');
            inputElement.value = '';
            inputElement.focus();

            // Сбрасываем и запускаем таймер
            examTimeLeft = EXAM_TIMER_DURATION;
            document.getElementById('examTimerText').textContent = examTimeLeft;
            document.getElementById('examTimerBar').style.width = '100%';
            document.getElementById('examTimerBar').style.backgroundColor = '#4CAF50';

            // Очищаем предыдущий интервал, если есть
            if (examTimerInterval) {
                clearInterval(examTimerInterval);
            }

            // Запускаем новый интервал таймера
            examTimerInterval = setInterval(updateExamTimer, 1000);
        }

        function updateExamTimer() {
            examTimeLeft--;

            // Обновляем текст таймера
            document.getElementById('examTimerText').textContent = examTimeLeft;

            // Обновляем прогресс-бар
            const percentage = (examTimeLeft / EXAM_TIMER_DURATION) * 100;
            const timerBar = document.getElementById('examTimerBar');
            timerBar.style.width = percentage + '%';

            // Меняем цвет в зависимости от оставшегося времени
            if (examTimeLeft <= 3) {
                timerBar.style.backgroundColor = '#f44336'; // красный
            } else if (examTimeLeft <= 5) {
                timerBar.style.backgroundColor = '#ff9800'; // оранжевый
            } else {
                timerBar.style.backgroundColor = '#4CAF50'; // зелёный
            }

            // Если время вышло - автоматический skip
            if (examTimeLeft <= 0) {
                clearInterval(examTimerInterval);
                console.log(`⏱️ Время вышло на вопросе ${examCurrentIndex + 1}`);
                handleExamAnswer(''); // пустой ответ = skip (0 баллов)
            }
        }

        function submitExamAnswer() {
            // Получаем ответ пользователя
            const userAnswer = document.getElementById('examAnswerInput').value.trim();

            // Проверяем, что ответ не пустой
            if (userAnswer === '') {
                alert('⚠️ Введите ответ или нажмите "Пропустить"');
                return;
            }

            // Останавливаем таймер
            if (examTimerInterval) {
                clearInterval(examTimerInterval);
            }

            // Обрабатываем ответ
            handleExamAnswer(userAnswer);
        }

        function skipExamQuestion() {
            // Останавливаем таймер
            if (examTimerInterval) {
                clearInterval(examTimerInterval);
            }

            console.log(`⏭️ Вопрос ${examCurrentIndex + 1} пропущен пользователем`);

            // Обрабатываем как пустой ответ (0 баллов)
            handleExamAnswer('');
        }

        function handleExamAnswer(userAnswer) {
            const question = examQuestions[examCurrentIndex];
            const correctAnswer = question.correctAnswer.toLowerCase().trim();
            const userAnswerNormalized = userAnswer.toLowerCase().trim();

            // Определяем результат
            let isCorrect = false;
            let score = EXAM_SCORE_SKIP; // по умолчанию 0 (skip)

            if (userAnswerNormalized === '') {
                // Пропущено (таймаут или ручной skip)
                isCorrect = false;
                score = EXAM_SCORE_SKIP;
            } else if (userAnswerNormalized === correctAnswer) {
                // Правильный ответ
                isCorrect = true;
                score = EXAM_SCORE_CORRECT;
            } else {
                // Неправильный ответ
                isCorrect = false;
                score = EXAM_SCORE_WRONG;
            }

            // Добавляем балл к общему счёту
            examScore += score;

            // Сохраняем ответ для статистики
            examAnswers.push({
                questionIndex: examCurrentIndex,
                question: question,
                userAnswer: userAnswer,
                correctAnswer: question.correctAnswer,
                isCorrect: isCorrect,
                score: score,
                timeSpent: EXAM_TIMER_DURATION - examTimeLeft
            });

            console.log(`${isCorrect ? '✅' : '❌'} Вопрос ${examCurrentIndex + 1}: "${userAnswer}" (правильный: "${question.correctAnswer}") - ${score} балл(ов)`);

            // Переходим к следующему вопросу
            examCurrentIndex++;
            showExamQuestion();
        }

        function confirmExitExam() {
            const confirmed = confirm(
                '⚠️ Вы уверены, что хотите выйти из экзамена?\n\n' +
                'Весь прогресс будет потерян!'
            );

            if (confirmed) {
                // Останавливаем таймер
                if (examTimerInterval) {
                    clearInterval(examTimerInterval);
                }

                // Сбрасываем состояние экзамена
                examQuestions = [];
                examCurrentIndex = 0;
                examAnswers = [];
                examScore = 0;
                examStartTime = null;

                console.log('❌ Экзамен прерван пользователем');

                // Возвращаемся на главное меню
                showMainMenu();
            }
        }

        function generateDetailedStats() {
            // Создаём объекты для группировки статистики
            const palabrasStats = {}; // { "FAMILIA": { correct: 2, total: 2 }, ... }
            const ejerciciosStats = {}; // { "ejercicio_1": { title: "...", correct: 5, total: 5 }, ... }

            // Итерируем по всем ответам и ДИНАМИЧЕСКИ собираем статистику
            examAnswers.forEach(answer => {
                const question = answer.question;

                if (question.type === 'palabra') {
                    // Группируем по semantic group
                    const groupName = question.group;

                    if (!palabrasStats[groupName]) {
                        palabrasStats[groupName] = {
                            correct: 0,
                            total: 0
                        };
                    }

                    palabrasStats[groupName].total++;
                    if (answer.isCorrect) {
                        palabrasStats[groupName].correct++;
                    }

                } else if (question.type === 'ejercicio') {
                    // Группируем по ejercicio ID
                    const exerciseId = question.exerciseId;

                    if (!ejerciciosStats[exerciseId]) {
                        ejerciciosStats[exerciseId] = {
                            title: question.exerciseTitle,
                            correct: 0,
                            total: 0
                        };
                    }

                    ejerciciosStats[exerciseId].total++;
                    if (answer.isCorrect) {
                        ejerciciosStats[exerciseId].correct++;
                    }
                }
            });

            // Вычисляем общие проценты для Palabras и Ejercicios
            let palabrasCorrect = 0;
            let palabrasTotal = 0;
            Object.values(palabrasStats).forEach(stat => {
                palabrasCorrect += stat.correct;
                palabrasTotal += stat.total;
            });

            let ejerciciosCorrect = 0;
            let ejerciciosTotal = 0;
            Object.values(ejerciciosStats).forEach(stat => {
                ejerciciosCorrect += stat.correct;
                ejerciciosTotal += stat.total;
            });

            const palabrasPercentage = palabrasTotal > 0 ? Math.round((palabrasCorrect / palabrasTotal) * 100) : 0;
            const ejerciciosPercentage = ejerciciosTotal > 0 ? Math.round((ejerciciosCorrect / ejerciciosTotal) * 100) : 0;

            return {
                palabras: {
                    percentage: palabrasPercentage,
                    correct: palabrasCorrect,
                    total: palabrasTotal,
                    groups: palabrasStats
                },
                ejercicios: {
                    percentage: ejerciciosPercentage,
                    correct: ejerciciosCorrect,
                    total: ejerciciosTotal,
                    exercises: ejerciciosStats
                }
            };
        }

        function showExamResults() {
            // Останавливаем таймер
            if (examTimerInterval) {
                clearInterval(examTimerInterval);
            }

            const totalQuestions = examQuestions.length;
            const correctAnswers = examAnswers.filter(a => a.isCorrect).length;

            // Вычисляем процент: (правильные ответы / всего вопросов) * 100
            // Не используем examScore, так как там могут быть штрафы
            const percentage = Math.round((correctAnswers / totalQuestions) * 100);

            // Определяем, сдан ли экзамен
            const passed = percentage >= EXAM_PASS_THRESHOLD;

            // Вычисляем затраченное время
            const timeSpentMs = Date.now() - examStartTime;
            const minutes = Math.floor(timeSpentMs / 60000);
            const seconds = Math.floor((timeSpentMs % 60000) / 1000);
            const timeSpentText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            // Обновляем UI результатов
            document.getElementById('examScorePercent').textContent = percentage + '%';
            document.getElementById('examCorrect').textContent = correctAnswers;
            document.getElementById('examTotal').textContent = totalQuestions;
            document.getElementById('examTimeSpent').textContent = timeSpentText;

            // Статус прохождения
            const statusElement = document.getElementById('examPassStatus');
            if (passed) {
                statusElement.textContent = '✅ Экзамен сдан!';
                statusElement.style.color = '#4CAF50';
            } else {
                statusElement.textContent = `❌ Экзамен не сдан (требуется ${EXAM_PASS_THRESHOLD}%)`;
                statusElement.style.color = '#f44336';
            }

            // Генерируем детальную статистику
            const detailedStats = generateDetailedStats();

            // Формируем HTML для детальной статистики
            let detailedHTML = '';

            // БЛОК PALABRAS
            if (detailedStats.palabras.total > 0) {
                detailedHTML += `
                    <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                        <h2 style="margin-bottom: 15px;">📚 Palabras: ${detailedStats.palabras.percentage}% (${detailedStats.palabras.correct}/${detailedStats.palabras.total})</h2>
                        <div style="display: grid; gap: 10px;">
                `;

                // Динамически итерируем по ВСЕМ группам (без хардкода!)
                Object.keys(detailedStats.palabras.groups).forEach(groupName => {
                    const groupStat = detailedStats.palabras.groups[groupName];
                    const groupPercentage = Math.round((groupStat.correct / groupStat.total) * 100);
                    const color = groupPercentage >= 80 ? '#4CAF50' : groupPercentage >= 50 ? '#ff9800' : '#f44336';

                    detailedHTML += `
                        <div style="background: white; padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: bold;">${groupName}</span>
                            <span style="color: ${color}; font-weight: bold;">${groupPercentage}% (${groupStat.correct}/${groupStat.total})</span>
                        </div>
                    `;
                });

                detailedHTML += `
                        </div>
                    </div>
                `;
            }

            // БЛОК EJERCICIOS
            if (detailedStats.ejercicios.total > 0) {
                detailedHTML += `
                    <div style="background: #f9f9f9; padding: 20px; border-radius: 10px;">
                        <h2 style="margin-bottom: 15px;">✍️ Ejercicios: ${detailedStats.ejercicios.percentage}% (${detailedStats.ejercicios.correct}/${detailedStats.ejercicios.total})</h2>
                        <div style="display: grid; gap: 10px;">
                `;

                // Динамически итерируем по ВСЕМ упражнениям (без хардкода!)
                Object.keys(detailedStats.ejercicios.exercises).forEach(exerciseId => {
                    const exerciseStat = detailedStats.ejercicios.exercises[exerciseId];
                    const exercisePercentage = Math.round((exerciseStat.correct / exerciseStat.total) * 100);
                    const color = exercisePercentage >= 80 ? '#4CAF50' : exercisePercentage >= 50 ? '#ff9800' : '#f44336';

                    detailedHTML += `
                        <div style="background: white; padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: bold;">${exerciseStat.title}</span>
                            <span style="color: ${color}; font-weight: bold;">${exercisePercentage}% (${exerciseStat.correct}/${exerciseStat.total})</span>
                        </div>
                    `;
                });

                detailedHTML += `
                        </div>
                    </div>
                `;
            }

            // Вставляем HTML в блок детальной статистики
            document.getElementById('examDetailedResults').innerHTML = detailedHTML;

            console.log(`🎓 Экзамен завершён: ${percentage}% (${correctAnswers}/${totalQuestions}), ${passed ? 'СДАН' : 'НЕ СДАН'}`);

            // Показываем экран результатов
            hideAll();
            document.getElementById('examResultsScreen').classList.remove('hidden');

            // Если экзамен сдан (≥80%), разблокируем следующую Unidad
            if (passed) {
                const profile = getActiveProfile();

                // Определяем последнюю разблокированную Unidad
                let lastUnlockedIndex = 0; // По умолчанию только unidad_1
                UNIDADES.forEach((unidad, index) => {
                    if (index === 0 || profile.unlocks[unidad]) {
                        lastUnlockedIndex = index;
                    }
                });

                // Проверяем, есть ли следующая Unidad для разблокировки
                const nextIndex = lastUnlockedIndex + 1;
                if (nextIndex < UNIDADES.length) {
                    const nextUnidad = UNIDADES[nextIndex];

                    // Разблокируем следующую Unidad
                    profile.unlocks[nextUnidad] = true;

                    // Сохраняем профиль
                    const state = loadAppState();
                    state.profiles[profile.id] = profile;
                    saveAppState(state);

                    console.log(`🎉 Разблокирована следующая Unidad: ${nextUnidad}`);

                    // Добавляем уведомление в статус прохождения
                    const statusElement = document.getElementById('examPassStatus');
                    statusElement.innerHTML = `
                        ✅ Экзамен сдан!<br>
                        <span style="color: #667eea; font-size: 0.9em;">🎉 Разблокирована ${nextUnidad.replace('_', ' ').toUpperCase()}!</span>
                    `;
                } else {
                    console.log('🎓 Поздравляем! Все Unidades пройдены!');
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // INITIALIZATION
        // ═══════════════════════════════════════════════════════════════
	
        window.addEventListener('DOMContentLoaded', async () => {
    // Загружаем все 10 Unidad JSON файлов
    for (let i = 1; i <= 10; i++) {
        await loadUnidadFromJson(`Unidad${i}.json`);
    }

    const state = loadAppState();
    const token = getToken();

    if (token) {
        // Читаем навигацию из localStorage
        let navState = null;
        try {
            const saved = localStorage.getItem('navigation_state');
            if (saved) navState = JSON.parse(saved);
        } catch (e) {
            console.error('Failed to load navigation state:', e);
        }

        if (navState && navState.screen_id) {
            // Восстанавливаем переменные
            currentUnidad = navState.current_unidad;
            currentCategory = navState.current_category;

            let targetScreen = navState.screen_id;

            // ЛОГИКА "ШАГ НАЗАД" для тестов и интерактива
            const testScreens = {
                'questionScreen': 'categoryMenu',
                'gramaticaQuestionScreen': 'gramaticaMenu',
                'cardMatchingScreen': 'categoryMenu',
                'grammarInteractiveScreen': 'grammarListScreen',
                // Ejercicios экраны - откатываем на gramaticaMenu при refresh
                'exercisePreviewMenu': 'gramaticaMenu',
                'grammarRuleScreen': 'gramaticaMenu',
                'microTestsScreen': 'gramaticaMenu'
            };

            if (testScreens[targetScreen]) {
                targetScreen = testScreens[targetScreen];
            }

            // Показываем экран
            hideAllScreens();
            const el = document.getElementById(targetScreen);
            if (el) {
                el.classList.remove('hidden');

                // Показываем badge для основных меню
                if (['mainMenu', 'unidadMenu', 'palabrasMenu', 'groupPreviewMenu', 'categoryMenu', 'gramaticaMenu', 'miniDictionaryScreen'].includes(targetScreen)) {
                    showUserBadge();
                }

                // Специфичная инициализация для каждого экрана
                if (targetScreen === 'mainMenu') updateUnidadUI();
                if (targetScreen === 'unidadMenu') {
                    showUnidadMenu(currentUnidad);
                }
                if (targetScreen === 'palabrasMenu') {
                    renderGroupCards();
                    updatePalabrasPagination();
                    const palabrasProgress = calculatePalabrasProgress(currentUnidad);
                    const avgText = document.getElementById('palabras-avg-progress-text');
                    if (avgText) avgText.textContent = palabrasProgress;
                }
                if (targetScreen === 'categoryMenu') {
                    showCategoryMenu(currentCategory);
                }
                if (targetScreen === 'groupPreviewMenu') {
                    showGroupPreview(currentCategory);
                }
                if (targetScreen === 'miniDictionaryScreen') {
                    showMiniDictionary();
                }
                if (targetScreen === 'gramaticaMenu') {
                    showGramaticaMenu();
                }
                if (targetScreen === 'grammarListScreen') {
                    showGrammarList();
                }
            } else {
                showProfileSelect();
            }
        } else {
            showProfileSelect();
        }
    } else {
        showStart();
    }
	  console.log('✅ Spanish Vocabulary Trainer v4.0 (Профили) загружен');
	  console.log('✅ Система профилей инициализирована');

    // Проверяем доступность экзамена при загрузке
    checkExamAvailability();
});

  // Global keyboard handler for Enter key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const modal = document.getElementById('feedbackModal');
      // If modal is visible, close it (go to next question)
      if (modal && !modal.classList.contains('hidden')) {
        e.preventDefault();
        closeModal();
      }
    }
  });





// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION & NAVIGATION
// ═══════════════════════════════════════════════════════════════

const API_URL = 'http://localhost:8000';
const ENABLE_BACKEND_SYNC = true; // Включить синхронизацию с бэкендом

// Навигация между экранами
function showStart() {
    hideAllScreens();
    document.getElementById('startScreen').classList.remove('hidden');
}

function showLoginScreen() {
    hideAllScreens();
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginEmail').focus();
}

function showRegisterScreen() {
    hideAllScreens();
    document.getElementById('registerScreen').classList.remove('hidden');
    document.getElementById('registerEmail').focus();
}

function hideAllScreens() {
    const screens = [
        'startScreen', 'loginScreen', 'registerScreen',
        'profileSelectScreen', 'profileCreateScreen',
        'mainMenu', 'unidadMenu', 'palabrasMenu', 'groupPreviewMenu', 'categoryMenu',
        'questionScreen', 'resultsScreen', 'verbMenu',
        'verbPracticeScreen', 'qaScreen',
        'gramaticaMenu', 'gramaticaQuestionScreen', 'gramaticaResultsScreen',
        'grammarListScreen', 'grammarDetailScreen', 'grammarInteractiveScreen',
        'cardMatchingScreen', 'cardMatchingResultsScreen',
        'examScreen', 'examResultsScreen',
        'miniDictionaryScreen',
        'exercisePreviewMenu', 'grammarRuleScreen', 'microTestsScreen',
        'referenceMainMenu', 'grammarSubMenu', 'vocabularyScreen',
        'ejerciciosGramaticaRefScreen'
    ];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

// Вспомогательные функции для работы с токеном
function saveToken(token) {
    localStorage.setItem('auth_token', token);
}

function getToken() {
    return localStorage.getItem('auth_token');
}

function clearToken() {
    localStorage.removeItem('auth_token');
}

function saveUserId(userId) {
    localStorage.setItem('user_id', userId);
}

function getUserId() {
    return localStorage.getItem('user_id');
}

function clearUserId() {
    localStorage.removeItem('user_id');
}

// Показать ошибку
function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}

function hideError(elementId) {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.classList.add('hidden');
    }
}

// ═══════════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════════

async function registerUser() {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    
    hideError('registerError');
    
    // Валидация
    if (!email || !password) {
        showError('registerError', '❌ Заполните все поля');
        return;
    }
    
    if (password.length < 6) {
        showError('registerError', '❌ Пароль должен быть минимум 6 символов');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (response.status === 409) {
            showError('registerError', '❌ Email уже зарегистрирован. Войдите в аккаунт.');
            return;
        }
        
        if (!response.ok) {
            throw new Error('Ошибка регистрации');
        }
        
        // Успешная регистрация → автоматический логин
        const data = await response.json();
        console.log('✅ Регистрация успешна:', data);
        
        // Теперь логинимся с теми же данными
        await loginUserAuto(email, password);
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        showError('registerError', '❌ Ошибка: ' + error.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════

async function loginUser() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    hideError('loginError');
    
    if (!email || !password) {
        showError('loginError', '❌ Заполните все поля');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (response.status === 401) {
            showError('loginError', '❌ Неверный email или пароль');
            return;
        }
        
        if (!response.ok) {
            throw new Error('Ошибка входа');
        }
        
        const data = await response.json();
        console.log('✅ Логин успешен, токен получен');
        
        // Сохраняем токен
        saveToken(data.access_token);
		saveUserId(data.user_id);
		const backendProgress = await loadProgressFromBackend();
		if (backendProgress) {
			localStorage.setItem(getStorageKey(), JSON.stringify(backendProgress));
			console.log('✅ Прогресс загружен с бекенда');
		}

        
        // Переходим к выбору профиля
        showProfileSelect();
        
    } catch (error) {
        console.error('Ошибка логина:', error);
        showError('loginError', '❌ Ошибка: ' + error.message);
    }
}

// Автоматический логин после регистрации
async function loginUserAuto(email, password) {
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!response.ok) throw new Error('Автологин не удался');
        
        const data = await response.json();
        saveToken(data.access_token);
		saveUserId(data.user_id)
		const backendProgress = await loadProgressFromBackend();
		if (backendProgress) {
			localStorage.setItem(getStorageKey(), JSON.stringify(backendProgress));
			console.log('✅ Прогресс загружен с бекенда');
		}

        console.log('✅ Автологин после регистрации успешен');
        showProfileSelect();
        
    } catch (error) {
        console.error('Ошибка автологина:', error);
        showError('registerError', '✅ Регистрация успешна! Теперь войдите в аккаунт.');
        setTimeout(() => showLoginScreen(), 2000);
    }
}

// ═══════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════

function logout() {
    clearToken();
    console.log('✅ Выход из аккаунта');
    showStart();
}

// ═══════════════════════════════════════════════════════════════
// GRAMÁTICA SYSTEM
// ═══════════════════════════════════════════════════════════════

let gramaticaExercises = [];
let gramCurrentPage = 0;
const GRAM_EXERCISES_PER_PAGE = 4;
let gramCurrentExercise = null;
let gramCurrentQuestions = [];
let gramCurrentQuestionIndex = 0;
let gramScore = 0;
let gramTimerInterval = null;
let gramTimeLeft = 10;
let __gramIsAwaitingNext = false;

// Load grammar data from JSON file
function loadGramaticaExercises() {
    const unidadData = window.unidadData;
    if (unidadData && unidadData.ejercicios) {
        gramaticaExercises = unidadData.ejercicios;
        console.log(`✅ Loaded ${gramaticaExercises.length} grammar exercises from JSON`);
    } else {
        gramaticaExercises = [];
        console.warn('⚠️ No grammar exercises found in unidadData.ejercicios');
    }
}

// Show Gramática menu with pagination
// preservePage = true означает сохранить текущую страницу (при возврате из теста)
async function showGramaticaMenu(preservePage = false) {
    if (!currentUnidad) {
        console.error('showGramaticaMenu called without currentUnidad');
        return;
    }

    // Используем данные из vocabularyData для текущей unidad
    const unidadData = vocabularyData[currentUnidad];
    if (!unidadData) {
        console.error(`showGramaticaMenu: vocabularyData[${currentUnidad}] is undefined`);
        alert(`Ошибка: данные для ${currentUnidad} не загружены.\nПопробуйте обновить страницу (F5).`);
        return;
    }

    // Сохраняем полный объект unidad для использования в упражнениях
    window.unidadData = unidadData;
    console.log(`✅ Using data for ${currentUnidad}`);

    loadGramaticaExercises();

    // Сбрасываем страницу только если не возвращаемся из теста
    if (!preservePage) {
        gramCurrentPage = 0;
    }

    hideAllScreens();
    showUserBadge();
    document.getElementById('gramaticaMenu').classList.remove('hidden');

    renderGramaticaExercises();
    updateGramaticaPagination();
    updateGramaticaProgress();
    saveNavigationState('gramaticaMenu');
}

// Render exercises for current page
function renderGramaticaExercises() {
    const container = document.getElementById('gramaticaExercisesContainer');
    container.innerHTML = '';

    const profile = getActiveProfile();
    if (!profile) return;

    ensureProgressSkeleton(profile);

    const startIdx = gramCurrentPage * GRAM_EXERCISES_PER_PAGE;
    const endIdx = Math.min(startIdx + GRAM_EXERCISES_PER_PAGE, gramaticaExercises.length);
    const pageExercises = gramaticaExercises.slice(startIdx, endIdx);

    pageExercises.forEach((exercise, idx) => {
        const exerciseId = exercise.id;
        const score = profile.progress[currentUnidad].ejercicios[exerciseId] || 0;
        const isPassed = score >= 80;

        const card = document.createElement('div');
        card.className = 'category-card';
        card.style.cursor = 'pointer';
        card.onclick = () => showExercisePreview(exercise);

        card.innerHTML = `
            <div class="category-header">
                <span class="category-title">${exercise.title}</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${score}%; background: #27ae60;"></div>
            </div>
            <p class="progress-text">${score}%</p>
        `;

        container.appendChild(card);
    });
}

// ═══════════════════════════════════════════════════════════════
// EXERCISE PREVIEW & GRAMMAR RULE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Переменная для хранения текущего упражнения при просмотре
let currentExerciseForPreview = null;

// ═══════════════════════════════════════════════════════════════
// MICRO-TESTS BANK SYSTEM
// ═══════════════════════════════════════════════════════════════
// Максимальное количество слотов (микро-тестов на экране)
const MAX_MICRO_TEST_SLOTS = 4;
// Банк вопросов сгруппированный по типу ответа
let microTestsQuestionBank = {};
// Полный список всех вопросов (для refresh когда нет вопросов с тем же ответом)
let microTestsAllQuestions = [];
// Индексы использованных вопросов (вопросы, на которые уже ответили)
let microTestsUsedQuestions = new Set();
// Текущие отображаемые вопросы (индекс вопроса для каждого слота)
let microTestsCurrentSlots = {};
// Типы ответов в текущем упражнении (для определения количества слотов)
let microTestsAnswerTypes = [];

// Показать промежуточный экран упражнения (аналог showGroupPreview для Palabras)
function showExercisePreview(exercise) {
    if (!currentUnidad) {
        console.error('showExercisePreview called without currentUnidad');
        return;
    }
    currentExerciseForPreview = exercise;

    hideAllScreens();
    showUserBadge();
    document.getElementById('exercisePreviewMenu').classList.remove('hidden');

    // Заголовок
    document.getElementById('exercisePreviewTitle').textContent = exercise.title;

    // Прогресс упражнения
    const profile = getActiveProfile();
    ensureProgressSkeleton(profile);
    const score = profile.progress[currentUnidad].ejercicios[exercise.id] || 0;
    document.getElementById('exercise-preview-progress-text').textContent = score + '%';
    document.getElementById('exercise-preview-progress-bar').style.width = score + '%';

    // Освоение банка
    const bankMastery = getBankMasteryPercent(exercise.id);
    document.getElementById('exercise-bank-mastery-text').textContent = bankMastery + '%';
    document.getElementById('exercise-bank-mastery-bar').style.width = bankMastery + '%';

    // ═══════════════════════════════════════════════════════════════
    // БЛОКИРОВКА КНОПКИ ТЕСТА: если микро-тесты не пройдены
    // ═══════════════════════════════════════════════════════════════
    const microTestsCompleted = areMicroTestsCompleted(currentUnidad, exercise.id);
    const testBtn = document.getElementById('exerciseTestBtn');
    const testBtnLabel = document.getElementById('exerciseTestBtnLabel');
    const testHint = document.getElementById('exerciseTestHint');

    if (microTestsCompleted) {
        // Разблокировано
        testBtn.disabled = false;
        testBtn.style.opacity = '1';
        testBtn.style.cursor = 'pointer';
        testBtn.style.borderColor = '#27ae60';
        testBtnLabel.innerHTML = 'Пройти<br>тест';
        testHint.classList.add('hidden');
    } else {
        // Заблокировано
        testBtn.disabled = true;
        testBtn.style.opacity = '0.5';
        testBtn.style.cursor = 'not-allowed';
        testBtn.style.borderColor = '#95a5a6';
        testBtnLabel.innerHTML = '🔒 Пройти<br>тест';
        testHint.classList.remove('hidden');
    }

    saveNavigationState('exercisePreviewMenu');
}

// Показать грамматическое правило (аналог showMiniDictionary для Palabras)
function showGrammarRule() {
    if (!currentExerciseForPreview) {
        console.error('showGrammarRule: no exercise selected');
        return;
    }

    const exercise = currentExerciseForPreview;
    const rule = exercise.rule;

    if (!rule) {
        alert('Правило для этого упражнения ещё не добавлено.');
        return;
    }

    // Сохраняем, что правило было просмотрено
    saveRuleViewed(exercise.id);

    hideAllScreens();
    showUserBadge();
    document.getElementById('grammarRuleScreen').classList.remove('hidden');

    // Заголовок
    document.getElementById('grammarRuleTitle').textContent = `📖 ${rule.title}`;
    document.getElementById('grammarRuleSubtitle').textContent = exercise.title;

    // Контейнер с правилом
    const container = document.getElementById('grammarRuleContainer');

    let html = '';

    // Основное объяснение (шрифт увеличен на 35%)
    html += `
        <div style="
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 18px;
        ">
            <p style="color: #2c3e50; font-size: 1.49em; line-height: 1.7; margin: 0;">${rule.explanation}</p>
        </div>
    `;

    // Секции (если есть) - шрифт увеличен на 35%
    if (rule.sections && rule.sections.length > 0) {
        rule.sections.forEach(section => {
            html += `
                <div style="
                    background: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 12px;
                    padding: 25px;
                    margin-bottom: 18px;
                ">
                    <h3 style="color: #667eea; margin: 0 0 15px 0; font-size: 1.62em;">${section.subtitle}</h3>
                    <ul style="margin: 0; padding-left: 25px;">
                        ${section.points.map(point => `
                            <li style="color: #2c3e50; font-size: 1.35em; line-height: 1.9; margin-bottom: 8px;">${point}</li>
                        `).join('')}
                    </ul>
                </div>
            `;
        });
    }

    // Таблица (если есть)
    if (rule.table) {
        html += `
            <div style="
                background: rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 15px;
                overflow-x: auto;
            ">
                ${rule.table}
            </div>
        `;
    }

    // Примеры (шрифт увеличен на 35%)
    if (rule.examples && rule.examples.length > 0) {
        html += `
            <div style="
                background: rgba(39, 174, 96, 0.2);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(39, 174, 96, 0.3);
                border-radius: 12px;
                padding: 25px;
                margin-bottom: 18px;
            ">
                <h3 style="color: #27ae60; margin: 0 0 18px 0; font-size: 1.62em;">📝 Примеры</h3>
                ${rule.examples.map(ex => `
                    <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid rgba(39, 174, 96, 0.2);">
                        <div style="color: #2c3e50; font-size: 1.42em; font-weight: 600;">${ex.es}</div>
                        <div style="color: #fff; font-size: 1.28em; font-style: italic; margin-top: 6px;">${ex.ru}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    container.innerHTML = html;

    // Показать/скрыть кнопку "Проверь себя" в зависимости от наличия микро-тестов
    const microTestsBtn = document.getElementById('microTestsBtn');
    if (microTestsBtn) {
        microTestsBtn.style.display = (exercise.microTests && exercise.microTests.length > 0) ? 'inline-block' : 'none';
    }

    saveNavigationState('grammarRuleScreen');
}

// Показать экран микро-тестов
function showMicroTestsScreen() {
    if (!currentExerciseForPreview) {
        console.error('showMicroTestsScreen: no exercise selected');
        return;
    }

    const exercise = currentExerciseForPreview;
    const microTests = exercise.microTests;

    if (!microTests || microTests.length === 0) {
        alert('Для этого упражнения нет микро-тестов.');
        return;
    }

    hideAllScreens();
    showUserBadge();
    document.getElementById('microTestsScreen').classList.remove('hidden');

    // Заголовок
    document.getElementById('microTestsSubtitle').textContent = exercise.title;

    // ═══════════════════════════════════════════════════════════════
    // ИНИЦИАЛИЗАЦИЯ БАНКА ВОПРОСОВ
    // ═══════════════════════════════════════════════════════════════
    initMicroTestsBank(microTests);

    // Обновим счётчик - показываем сколько типов ответов
    document.getElementById('microTestsTotal').textContent = microTestsAnswerTypes.length;

    // Рендер микро-тестов (один слот на каждый тип ответа)
    renderMicroTestsSlots();

    // Инициализация обработчиков
    initMicroTestsHandlers(exercise);

    saveNavigationState('microTestsScreen');
}

// Инициализация банка вопросов микро-тестов
function initMicroTestsBank(microTests) {
    // Сбросим глобальные переменные
    microTestsQuestionBank = {};
    microTestsUsedQuestions = new Set();
    microTestsCurrentSlots = {};
    microTestsAnswerTypes = [];
    microTestsAllQuestions = [];

    // Сохраняем все вопросы для fallback refresh
    microTests.forEach((test, index) => {
        microTestsAllQuestions.push({
            index: index,
            sentence: test.sentence,
            answer: test.answer,
            hint: test.hint
        });
    });

    // Группируем вопросы по типу ответа (нормализуем к lowercase)
    microTests.forEach((test, index) => {
        const answerType = test.answer.toLowerCase();
        if (!microTestsQuestionBank[answerType]) {
            microTestsQuestionBank[answerType] = [];
            microTestsAnswerTypes.push(answerType);
        }
        microTestsQuestionBank[answerType].push({
            index: index,
            sentence: test.sentence,
            answer: test.answer,
            hint: test.hint
        });
    });

    // Если типов ответов больше MAX_MICRO_TEST_SLOTS, выбираем случайные
    if (microTestsAnswerTypes.length > MAX_MICRO_TEST_SLOTS) {
        // Перемешиваем и берём первые MAX_MICRO_TEST_SLOTS
        const shuffled = [...microTestsAnswerTypes].sort(() => Math.random() - 0.5);
        microTestsAnswerTypes = shuffled.slice(0, MAX_MICRO_TEST_SLOTS);
    }

    // Выбираем случайный вопрос для каждого типа ответа
    microTestsAnswerTypes.forEach(answerType => {
        const questions = microTestsQuestionBank[answerType];
        const randomIndex = Math.floor(Math.random() * questions.length);
        microTestsCurrentSlots[answerType] = questions[randomIndex].index;
    });
}

// Получить случайный неиспользованный вопрос для типа ответа
// Если нет вопросов с таким же ответом, берём любой из банка (fallback)
function getRandomUnusedQuestion(answerType, currentQuestionIndex) {
    const questions = microTestsQuestionBank[answerType];

    // Сначала пробуем найти вопрос с тем же типом ответа
    if (questions) {
        const availableQuestions = questions.filter(q =>
            !microTestsUsedQuestions.has(q.index) && q.index !== currentQuestionIndex
        );
        if (availableQuestions.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableQuestions.length);
            return availableQuestions[randomIndex];
        }
    }

    // Fallback: берём любой неиспользованный вопрос из общего банка
    const allAvailable = microTestsAllQuestions.filter(q =>
        !microTestsUsedQuestions.has(q.index) && q.index !== currentQuestionIndex
    );
    if (allAvailable.length > 0) {
        const randomIndex = Math.floor(Math.random() * allAvailable.length);
        return allAvailable[randomIndex];
    }

    return null;
}

// Рендер слотов микро-тестов
function renderMicroTestsSlots() {
    const container = document.getElementById('microTestsContainer');
    const microTests = currentExerciseForPreview.microTests;
    let html = '';

    // Считаем сколько слотов завершено (текущий вопрос в слоте отвечен)
    let completedSlots = 0;
    microTestsAnswerTypes.forEach(answerType => {
        const currentQuestionIndex = microTestsCurrentSlots[answerType];
        if (microTestsUsedQuestions.has(currentQuestionIndex)) {
            completedSlots++;
        }
    });

    microTestsAnswerTypes.forEach((answerType, slotIndex) => {
        const currentQuestionIndex = microTestsCurrentSlots[answerType];
        const test = microTests[currentQuestionIndex];
        const questions = microTestsQuestionBank[answerType];

        // Проверяем, есть ли ещё доступные вопросы для refresh
        // Сначала проверяем вопросы с тем же типом ответа
        const sameTypeAvailable = questions.filter(q =>
            !microTestsUsedQuestions.has(q.index) && q.index !== currentQuestionIndex
        );
        // Затем проверяем общий банк (fallback)
        const anyAvailable = microTestsAllQuestions.filter(q =>
            !microTestsUsedQuestions.has(q.index) && q.index !== currentQuestionIndex
        );
        const canRefresh = sameTypeAvailable.length > 0 || anyAvailable.length > 0;

        // Проверяем, был ли этот вопрос уже отвечен
        const isAnswered = microTestsUsedQuestions.has(currentQuestionIndex);

        // Формируем предложение с ответом или пропуском
        const sentenceHtml = isAnswered
            ? test.sentence.replace('___', `<span style="color: #27ae60; font-weight: 600; border-bottom: 2px solid #27ae60; padding: 0 4px;">${test.answer}</span>`)
            : test.sentence.replace('___', '<span class="micro-test-blank" style="border-bottom: 2px dashed rgba(155, 89, 182, 0.6); padding: 0 8px;">______</span>');

        html += `
            <div class="micro-test-item" data-slot="${slotIndex}" data-answer-type="${answerType}" data-question-index="${currentQuestionIndex}" style="
                background: ${isAnswered ? 'rgba(39, 174, 96, 0.15)' : 'rgba(155, 89, 182, 0.15)'};
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid ${isAnswered ? 'rgba(39, 174, 96, 0.3)' : 'rgba(155, 89, 182, 0.3)'};
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 18px;
                position: relative;
            ">
                ${!isAnswered && canRefresh ? `
                    <button class="micro-test-refresh-btn" data-slot="${slotIndex}" data-answer-type="${answerType}" style="
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        background: rgba(52, 152, 219, 0.3);
                        border: 1px solid rgba(52, 152, 219, 0.5);
                        border-radius: 8px;
                        padding: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    " title="Другой вопрос">
                        <img src="icons/arrows-clockwise.svg" alt="" style="width: 18px; height: 18px; filter: brightness(0) invert(1);">
                    </button>
                ` : ''}

                <div class="micro-test-sentence" style="
                    color: #2c3e50;
                    font-size: 1.42em;
                    margin-bottom: ${isAnswered ? '0' : '15px'};
                    line-height: 1.6;
                    padding-right: ${!isAnswered && canRefresh ? '50px' : '0'};
                ">
                    ${sentenceHtml}
                </div>

                ${!isAnswered ? `
                    <div class="micro-test-input-row" style="
                        display: flex;
                        gap: 12px;
                        align-items: center;
                        flex-wrap: wrap;
                    ">
                        <input type="text"
                               class="micro-test-input"
                               data-slot="${slotIndex}"
                               data-answer-type="${answerType}"
                               placeholder="Твой ответ..."
                               autocomplete="off"
                               style="
                                   flex: 1;
                                   min-width: 140px;
                                   padding: 12px 18px;
                                   border: 2px solid rgba(155, 89, 182, 0.4);
                                   border-radius: 8px;
                                   font-size: 1.35em;
                                   background: rgba(255, 255, 255, 0.9);
                                   color: #2c3e50;
                               "
                        />
                        <button class="micro-test-check-btn" data-slot="${slotIndex}" data-answer-type="${answerType}" style="
                            padding: 12px 24px;
                            background: linear-gradient(135deg, #9b59b6, #8e44ad);
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1.28em;
                            font-weight: 600;
                        ">
                            Проверить
                        </button>
                    </div>

                    <div class="micro-test-hint" data-slot="${slotIndex}" style="
                        color: rgba(255, 255, 255, 0.7);
                        font-size: 1.15em;
                        margin-top: 10px;
                        font-style: italic;
                        cursor: pointer;
                    ">
                        💡 Показать подсказку
                    </div>

                    <div class="micro-test-feedback" data-slot="${slotIndex}" style="
                        margin-top: 10px;
                        padding: 10px;
                        border-radius: 8px;
                        display: none;
                        font-weight: 600;
                    "></div>
                ` : ''}
            </div>
        `;
    });

    // Блок завершения + кнопки (показываются когда ВСЕ слоты завершены)
    const allCompleted = completedSlots === microTestsAnswerTypes.length && microTestsAnswerTypes.length > 0;

    if (allCompleted) {
        html += `
            <div id="microTestsAllDone" style="
                background: rgba(39, 174, 96, 0.3);
                border: 1px solid rgba(39, 174, 96, 0.5);
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                margin-top: 15px;
            ">
                <span style="font-size: 2em;">🎉</span>
                <p style="color: #27ae60; font-weight: 600; margin: 10px 0 0 0; font-size: 1.1em;">
                    Все микро-тесты пройдены!
                </p>
            </div>

            <div style="display: flex; gap: 15px; justify-content: center; margin-top: 20px; flex-wrap: wrap;">
                <button id="microTestsRetryBtn" onclick="resetMicroTestsBank()" style="
                    padding: 14px 28px;
                    background: rgba(52, 152, 219, 0.5);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(52, 152, 219, 0.5);
                    border-radius: 10px;
                    color: white;
                    font-size: 1.15em;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                ">
                    <img src="icons/arrows-clockwise.svg" alt="" style="width: 20px; height: 20px; filter: brightness(0) invert(1);">
                    Попробовать снова
                </button>

                <button onclick="goToTestFromMicroTests()" style="
                    padding: 14px 28px;
                    background: rgba(39, 174, 96, 0.5);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(39, 174, 96, 0.5);
                    border-radius: 10px;
                    color: white;
                    font-size: 1.15em;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">
                    Перейти к тесту →
                </button>
            </div>
        `;
    }

    container.innerHTML = html;
}

// Сброс банка вопросов
function resetMicroTestsBank() {
    const microTests = currentExerciseForPreview.microTests;
    initMicroTestsBank(microTests);
    renderMicroTestsSlots();
    initMicroTestsHandlers(currentExerciseForPreview);

    // Сбросить прогресс в localStorage для этого упражнения
    const profile = getActiveProfile();
    if (profile && profile.microTestsProgress && profile.microTestsProgress[currentUnidad]) {
        delete profile.microTestsProgress[currentUnidad][currentExerciseForPreview.id];
        const state = loadAppState();
        state.profiles[state.activeProfileId] = profile;
        saveAppState(state);
    }

    // Обновляем счётчик
    updateMicroTestsCounter(0, microTestsAnswerTypes.length);
}

// Обновить вопрос в слоте (refresh)
function refreshMicroTestSlot(answerType) {
    const currentQuestionIndex = microTestsCurrentSlots[answerType];
    const newQuestion = getRandomUnusedQuestion(answerType, currentQuestionIndex);
    if (!newQuestion) return;

    // Обновляем текущий слот
    microTestsCurrentSlots[answerType] = newQuestion.index;

    // Перерендерим слоты
    renderMicroTestsSlots();
    initMicroTestsHandlers(currentExerciseForPreview);
}

// Вернуться к экрану правила
function backToGrammarRule() {
    showGrammarRule();
}

// Инициализация обработчиков микро-тестов
function initMicroTestsHandlers(exercise) {
    const microTests = exercise.microTests;

    // Загрузим уже выполненные тесты из localStorage (только для ТЕКУЩИХ слотов)
    const profile = getActiveProfile();
    if (profile && profile.microTestsProgress && profile.microTestsProgress[currentUnidad]) {
        const savedData = profile.microTestsProgress[currentUnidad][exercise.id];
        // Новый формат: { slots: {...}, answered: [...] }
        if (savedData && savedData.slots && savedData.answered) {
            // Проверяем, совпадают ли сохранённые слоты с текущими
            const slotsMatch = JSON.stringify(savedData.slots) === JSON.stringify(microTestsCurrentSlots);
            if (slotsMatch) {
                savedData.answered.forEach(idx => microTestsUsedQuestions.add(idx));
            }
            // Если слоты не совпадают - игнорируем старый прогресс
        }
        // Старый формат (массив) - игнорируем, т.к. не знаем какие были слоты
    }

    // Считаем завершённые слоты (текущий вопрос в слоте отвечен)
    let completedSlots = 0;
    microTestsAnswerTypes.forEach(answerType => {
        const currentQuestionIndex = microTestsCurrentSlots[answerType];
        if (microTestsUsedQuestions.has(currentQuestionIndex)) {
            completedSlots++;
        }
    });

    // Обновим счётчик
    updateMicroTestsCounter(completedSlots, microTestsAnswerTypes.length);

    // Обработчики для кнопок "Проверить"
    document.querySelectorAll('.micro-test-check-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (this.disabled) return;

            const slot = parseInt(this.dataset.slot);
            const answerType = this.dataset.answerType;
            const questionIndex = microTestsCurrentSlots[answerType];

            if (microTestsUsedQuestions.has(questionIndex)) return; // Уже отвечен

            const input = document.querySelector(`.micro-test-input[data-slot="${slot}"]`);
            const userAnswer = input.value.trim().toLowerCase();
            const correctAnswer = microTests[questionIndex].answer.toLowerCase();

            const feedback = document.querySelector(`.micro-test-feedback[data-slot="${slot}"]`);

            if (userAnswer === correctAnswer) {
                // Правильный ответ - добавляем в использованные
                microTestsUsedQuestions.add(questionIndex);
                saveMicroTestProgress(exercise.id, Array.from(microTestsUsedQuestions));

                // Считаем завершённые слоты (текущий вопрос в слоте отвечен)
                let newCompletedSlots = 0;
                microTestsAnswerTypes.forEach(at => {
                    const idx = microTestsCurrentSlots[at];
                    if (microTestsUsedQuestions.has(idx)) {
                        newCompletedSlots++;
                    }
                });

                updateMicroTestsCounter(newCompletedSlots, microTestsAnswerTypes.length);

                // Перерендерим слоты чтобы показать новое состояние
                renderMicroTestsSlots();
                initMicroTestsHandlers(exercise);

                // Проверка завершения всех слотов
                if (newCompletedSlots === microTestsAnswerTypes.length) {
                    saveMicroTestsCompleted(exercise.id);
                }
            } else {
                // Неправильный ответ
                feedback.style.display = 'block';
                feedback.style.background = 'rgba(231, 76, 60, 0.3)';
                feedback.style.color = '#e74c3c';
                feedback.innerHTML = '✗ Попробуй ещё раз';

                // Встряхнём поле ввода
                input.style.animation = 'shake 0.3s';
                setTimeout(() => { input.style.animation = ''; }, 300);
            }
        });
    });

    // Обработчик Enter для input
    document.querySelectorAll('.micro-test-input').forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const slot = this.dataset.slot;
                const btn = document.querySelector(`.micro-test-check-btn[data-slot="${slot}"]`);
                if (btn) btn.click();
            }
        });
    });

    // Обработчики для кнопок Refresh
    document.querySelectorAll('.micro-test-refresh-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const answerType = this.dataset.answerType;
            refreshMicroTestSlot(answerType);
        });
    });

    // Обработчики для подсказок
    document.querySelectorAll('.micro-test-hint').forEach(hint => {
        hint.addEventListener('click', function() {
            const slot = parseInt(this.dataset.slot);
            const answerType = microTestsAnswerTypes[slot];
            const questionIndex = microTestsCurrentSlots[answerType];
            const test = microTests[questionIndex];
            this.innerHTML = '💡 ' + test.hint;
        });
    });
}

// Обновить счётчик выполненных микро-тестов
function updateMicroTestsCounter(completed, total) {
    const counter = document.getElementById('microTestsCompleted');
    if (counter) {
        counter.textContent = completed;
    }
}

// Отметить микро-тест как выполненный
function markMicroTestAsCompleted(index, correctAnswer) {
    const item = document.querySelector(`.micro-test-item[data-index="${index}"]`);
    if (!item) return;

    const input = item.querySelector('.micro-test-input');
    const btn = item.querySelector('.micro-test-check-btn');

    if (input) {
        input.value = correctAnswer;
        input.disabled = true;
        input.style.background = 'rgba(39, 174, 96, 0.2)';
        input.style.borderColor = 'rgba(39, 174, 96, 0.5)';
    }
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'default';
    }

    item.style.opacity = '0.7';
}

// Показать сообщение о завершении всех микро-тестов
function showAllMicroTestsDone() {
    const doneBlock = document.getElementById('microTestsAllDone');
    if (doneBlock) {
        doneBlock.style.display = 'block';
    }
}

// Перейти к тесту из microTestsScreen
function goToTestFromMicroTests() {
    if (!currentExerciseForPreview) return;
    startGramExercise(currentExerciseForPreview);
}

// Сохранить прогресс микро-тестов
function saveMicroTestProgress(exerciseId, completedIndices) {
    const profile = getActiveProfile();
    if (!profile) return;

    if (!profile.microTestsProgress) {
        profile.microTestsProgress = {};
    }
    if (!profile.microTestsProgress[currentUnidad]) {
        profile.microTestsProgress[currentUnidad] = {};
    }

    // Сохраняем слоты вместе с отвеченными индексами
    // Это позволяет проверить при загрузке, что слоты совпадают
    profile.microTestsProgress[currentUnidad][exerciseId] = {
        slots: { ...microTestsCurrentSlots },
        answered: completedIndices
    };

    // Сохраняем в localStorage
    const state = loadAppState();
    state.profiles[profile.id] = profile;
    saveAppState(state);
}

// Отметить, что все микро-тесты пройдены (для проверки условия разблокировки)
function saveMicroTestsCompleted(exerciseId) {
    const profile = getActiveProfile();
    if (!profile) return;

    if (!profile.microTestsCompleted) {
        profile.microTestsCompleted = {};
    }
    if (!profile.microTestsCompleted[currentUnidad]) {
        profile.microTestsCompleted[currentUnidad] = {};
    }

    profile.microTestsCompleted[currentUnidad][exerciseId] = true;

    // Сохраняем в localStorage
    const state = loadAppState();
    state.profiles[profile.id] = profile;
    saveAppState(state);
}

// Проверить, пройдены ли все микро-тесты для упражнения
function areMicroTestsCompleted(unidadId, exerciseId) {
    const profile = getActiveProfile();
    if (!profile || !profile.microTestsCompleted) return false;
    return profile.microTestsCompleted[unidadId]?.[exerciseId] === true;
}

// Сохранить, что правило было просмотрено
function saveRuleViewed(exerciseId) {
    const profile = getActiveProfile();
    if (!profile) return;

    if (!profile.ruleViewed) {
        profile.ruleViewed = {};
    }
    if (!profile.ruleViewed[currentUnidad]) {
        profile.ruleViewed[currentUnidad] = {};
    }

    profile.ruleViewed[currentUnidad][exerciseId] = true;

    // Сохраняем в localStorage
    const state = loadAppState();
    state.profiles[profile.id] = profile;
    saveAppState(state);
}

// Проверить, было ли правило просмотрено
function isRuleViewed(unidadId, exerciseId) {
    const profile = getActiveProfile();
    if (!profile || !profile.ruleViewed) return false;
    return profile.ruleViewed[unidadId]?.[exerciseId] === true;
}

// ═══════════════════════════════════════════════════════════════
// WORDS VIEWED (аналогично ruleViewed для Palabras)
// ═══════════════════════════════════════════════════════════════

// Сохранить, что словарь группы был просмотрен
function saveWordsViewed(unidadId, groupName) {
    const profile = getActiveProfile();
    if (!profile) return;

    if (!profile.wordsViewed) {
        profile.wordsViewed = {};
    }
    if (!profile.wordsViewed[unidadId]) {
        profile.wordsViewed[unidadId] = {};
    }

    profile.wordsViewed[unidadId][groupName] = true;

    // Сохраняем в localStorage
    const state = loadAppState();
    state.profiles[profile.id] = profile;
    saveAppState(state);
}

// Проверить, был ли словарь группы просмотрен
function isWordsViewed(unidadId, groupName) {
    const profile = getActiveProfile();
    if (!profile || !profile.wordsViewed) return false;
    return profile.wordsViewed[unidadId]?.[groupName] === true;
}

// Вернуться к промежуточному экрану упражнения
function backToExercisePreview() {
    if (currentExerciseForPreview) {
        showExercisePreview(currentExerciseForPreview);
    } else {
        showGramaticaMenu();
    }
}

// Перейти к тесту (запустить упражнение)
function proceedToExercise() {
    if (!currentExerciseForPreview) return;

    // Проверяем, пройдены ли микро-тесты
    if (!areMicroTestsCompleted(currentUnidad, currentExerciseForPreview.id)) {
        alert('Сначала пройдите все микро-тесты в разделе "Проверь себя"!');
        return;
    }

    startGramExercise(currentExerciseForPreview);
}

// Pagination functions
function updateGramaticaPagination() {
    const totalPages = Math.ceil(gramaticaExercises.length / GRAM_EXERCISES_PER_PAGE);
    const paginationContainer = document.getElementById('gramaticaPagination');
    const pageIndicator = document.getElementById('gramPageIndicator');
    const prevBtn = document.getElementById('gramPrevBtn');
    const nextBtn = document.getElementById('gramNextBtn');

    // Скрываем весь блок пагинации если только 1 страница
    if (paginationContainer) {
        paginationContainer.style.display = totalPages <= 1 ? 'none' : 'flex';
    }

    if (pageIndicator) pageIndicator.textContent = `Страница ${gramCurrentPage + 1} / ${totalPages}`;
    if (prevBtn) prevBtn.classList.toggle('hidden', gramCurrentPage === 0);
    if (nextBtn) nextBtn.classList.toggle('hidden', gramCurrentPage >= totalPages - 1);
}

function gramaticaPrevPage() {
    if (gramCurrentPage > 0) {
        gramCurrentPage--;
        renderGramaticaExercises();
        updateGramaticaPagination();
    }
}

function gramaticaNextPage() {
    const totalPages = Math.ceil(gramaticaExercises.length / GRAM_EXERCISES_PER_PAGE);
    if (gramCurrentPage < totalPages - 1) {
        gramCurrentPage++;
        renderGramaticaExercises();
        updateGramaticaPagination();
    }
}

// Calculate and display grammar progress
function calculateGramaticaProgress() {
    const profile = getActiveProfile();
    if (!profile) return 0;

    ensureProgressSkeleton(profile);

    if (gramaticaExercises.length === 0) return 0;

    let totalScore = 0;
    gramaticaExercises.forEach(exercise => {
        const score = profile.progress[currentUnidad].ejercicios[exercise.id] || 0;
        totalScore += score;
    });

    return Math.round(totalScore / gramaticaExercises.length);
}

function updateGramaticaProgress() {
    const avgProgress = calculateGramaticaProgress();
    const avgText = document.getElementById('gramatica-avg-progress-text');
    if (avgText) avgText.textContent = avgProgress;
}

// ═══════════════════════════════════════════════════════════════
// GRAMMAR TEST QUESTION BANK SYSTEM
// ═══════════════════════════════════════════════════════════════
const GRAM_TEST_QUESTIONS_COUNT = 15; // Количество вопросов в тесте

// Получить индексы заблокированных вопросов (из предыдущего теста)
function getExcludedQuestionIndices(exerciseId) {
    const profile = getActiveProfile();
    if (!profile) return [];

    if (!profile.gramTestExcluded) return [];
    if (!profile.gramTestExcluded[currentUnidad]) return [];

    return profile.gramTestExcluded[currentUnidad][exerciseId] || [];
}

// Сохранить индексы текущего теста как заблокированные для следующего
function saveExcludedQuestionIndices(exerciseId, questionIndices) {
    const profile = getActiveProfile();
    if (!profile) return;

    if (!profile.gramTestExcluded) {
        profile.gramTestExcluded = {};
    }
    if (!profile.gramTestExcluded[currentUnidad]) {
        profile.gramTestExcluded[currentUnidad] = {};
    }

    profile.gramTestExcluded[currentUnidad][exerciseId] = questionIndices;

    // Сохраняем в localStorage
    const state = loadAppState();
    state.profiles[profile.id] = profile;
    saveAppState(state);
}

// Выбрать вопросы для теста с учётом исключений
function selectQuestionsForTest(exercise) {
    const allQuestions = exercise.questions;
    const excluded = getExcludedQuestionIndices(exercise.id);

    // Создаём массив с индексами для отслеживания
    const questionsWithIndices = allQuestions.map((q, idx) => ({
        ...q,
        originalIndex: idx
    }));

    // Фильтруем: исключаем вопросы из предыдущего теста
    let available = questionsWithIndices.filter(q => !excluded.includes(q.originalIndex));

    // Если после исключения осталось меньше чем нужно — берём все доступные
    // + добавляем случайные из исключённых
    if (available.length < GRAM_TEST_QUESTIONS_COUNT && excluded.length > 0) {
        const excludedQuestions = questionsWithIndices.filter(q => excluded.includes(q.originalIndex));
        available = [...available, ...shuffleArray(excludedQuestions)];
    }

    // Перемешиваем и берём нужное количество
    const shuffled = shuffleArray(available);
    const selected = shuffled.slice(0, Math.min(GRAM_TEST_QUESTIONS_COUNT, shuffled.length));

    // Сохраняем индексы выбранных вопросов для блокировки в следующий раз
    const selectedIndices = selected.map(q => q.originalIndex);
    saveExcludedQuestionIndices(exercise.id, selectedIndices);

    return selected;
}

// ═══════════════════════════════════════════════════════════════
// REFRESH PROTECTION - защита от обновления страницы mid-test
// ═══════════════════════════════════════════════════════════════

// Пометить тест как "в процессе"
function markTestInProgress(exerciseId) {
    const profile = getActiveProfile();
    if (!profile) return;

    if (!profile.gramTestInProgress) {
        profile.gramTestInProgress = {};
    }
    if (!profile.gramTestInProgress[currentUnidad]) {
        profile.gramTestInProgress[currentUnidad] = {};
    }

    profile.gramTestInProgress[currentUnidad][exerciseId] = true;

    // Сохраняем в localStorage
    const state = loadAppState();
    state.profiles[profile.id] = profile;
    saveAppState(state);
}

// Убрать флаг "в процессе" (тест завершён нормально)
function clearTestInProgress(exerciseId) {
    const profile = getActiveProfile();
    if (!profile) return;

    if (profile.gramTestInProgress &&
        profile.gramTestInProgress[currentUnidad]) {
        delete profile.gramTestInProgress[currentUnidad][exerciseId];
        // Сохраняем в localStorage
        const state = loadAppState();
        state.profiles[profile.id] = profile;
        saveAppState(state);
    }
}

// Проверить, был ли брошенный тест (refresh mid-test)
// Если да — вопросы уже заблокированы через saveExcludedQuestionIndices
function checkAndHandleAbandonedTest(exerciseId) {
    const profile = getActiveProfile();
    if (!profile) return false;

    if (profile.gramTestInProgress &&
        profile.gramTestInProgress[currentUnidad] &&
        profile.gramTestInProgress[currentUnidad][exerciseId]) {
        // Был брошенный тест — вопросы уже сохранены как заблокированные
        // Просто очищаем флаг
        console.log(`⚠️ Обнаружен брошенный тест для ${exerciseId}. Вопросы заблокированы.`);
        clearTestInProgress(exerciseId);
        return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════
// MASTERED QUESTIONS (освоенные вопросы банка)
// ═══════════════════════════════════════════════════════════════

// Получить список освоенных вопросов для упражнения
function getMasteredQuestions(exerciseId) {
    const profile = getActiveProfile();
    if (!profile) return [];
    if (!profile.masteredQuestions) return [];
    if (!profile.masteredQuestions[currentUnidad]) return [];
    return profile.masteredQuestions[currentUnidad][exerciseId] || [];
}

// Сохранить освоенные вопросы (добавить новые к существующим)
function addMasteredQuestions(exerciseId, newQuestionIndices) {
    const profile = getActiveProfile();
    if (!profile) return;

    // Инициализация структуры
    if (!profile.masteredQuestions) profile.masteredQuestions = {};
    if (!profile.masteredQuestions[currentUnidad]) profile.masteredQuestions[currentUnidad] = {};
    if (!profile.masteredQuestions[currentUnidad][exerciseId]) {
        profile.masteredQuestions[currentUnidad][exerciseId] = [];
    }

    // Добавляем только уникальные индексы
    const existing = profile.masteredQuestions[currentUnidad][exerciseId];
    const merged = [...new Set([...existing, ...newQuestionIndices])];
    profile.masteredQuestions[currentUnidad][exerciseId] = merged;

    // Сохраняем в localStorage
    const state = loadAppState();
    state.profiles[profile.id] = profile;
    saveAppState(state);

    // Синхронизируем с бэкендом
    syncProgressToBackend();
}

// Получить процент освоения банка (0-100)
function getBankMasteryPercent(exerciseId, totalQuestions = 60) {
    const mastered = getMasteredQuestions(exerciseId);
    return Math.round((mastered.length / totalQuestions) * 100);
}

// Start a grammar exercise
function startGramExercise(exercise) {
    gramCurrentExercise = exercise;

    // Проверяем, был ли брошенный тест (refresh mid-test)
    const wasAbandoned = checkAndHandleAbandonedTest(exercise.id);
    if (wasAbandoned) {
        console.log('📝 Предыдущая попытка была прервана. Новые вопросы будут другими.');
    }

    // Выбираем вопросы с учётом банка и исключений
    gramCurrentQuestions = selectQuestionsForTest(exercise);

    gramCurrentQuestionIndex = 0;
    gramScore = 0;
    __gramIsAwaitingNext = false;

    // Помечаем тест как "в процессе"
    markTestInProgress(exercise.id);

    hideAllScreens();
    showUserBadge();
    document.getElementById('gramaticaQuestionScreen').classList.remove('hidden');

    showGramQuestion();
}

// Show current grammar question
function showGramQuestion() {
    if (gramCurrentQuestionIndex >= gramCurrentQuestions.length) {
        stopGramTimer();
        showGramResults();
        return;
    }

    __gramIsAwaitingNext = false;

    const question = gramCurrentQuestions[gramCurrentQuestionIndex];

    document.getElementById('gramQuestionProgress').textContent =
        `Вопрос ${gramCurrentQuestionIndex + 1} из ${gramCurrentQuestions.length}`;

    document.getElementById('gramHintText').textContent =
        `Подсказка: ${gramCurrentExercise.hint}`;

    document.getElementById('gramQuestionText').textContent = question.sentence;

    document.getElementById('gramInput').value = '';
    document.getElementById('gramInput').focus();

    startGramTimer();
}

// Timer for grammar
function startGramTimer() {
    stopGramTimer();
    gramTimeLeft = TIMER_DURATION_DEFAULT;
    updateGramTimerDisplay();

    gramTimerInterval = setInterval(() => {
        gramTimeLeft -= 0.1;
        updateGramTimerDisplay();

        if (gramTimeLeft <= 0) {
            stopGramTimer();
            handleGramTimeOut();
        }
    }, 100);
}

function stopGramTimer() {
    if (gramTimerInterval) {
        clearInterval(gramTimerInterval);
        gramTimerInterval = null;
    }
}

function updateGramTimerDisplay() {
    const timerBar = document.getElementById('gramTimerBar');
    const timerText = document.getElementById('gramTimerText');

    if (!timerBar || !timerText) return;

    const percentage = (gramTimeLeft / TIMER_DURATION_DEFAULT) * 100;
    timerBar.style.width = percentage + '%';
    timerText.textContent = Math.ceil(gramTimeLeft);

    timerBar.classList.remove('timer-warning', 'timer-danger');
    timerText.classList.remove('timer-text-warning', 'timer-text-danger');

    if (gramTimeLeft <= 3) {
        timerBar.classList.add('timer-danger');
        timerText.classList.add('timer-text-danger');
    } else if (gramTimeLeft <= 5) {
        timerBar.classList.add('timer-warning');
        timerText.classList.add('timer-text-warning');
    }
}

function handleGramTimeOut() {
    if (__gramIsAwaitingNext) return;
    __gramIsAwaitingNext = true;

    const question = gramCurrentQuestions[gramCurrentQuestionIndex];
    showFeedback(false, `Время вышло! Правильный ответ: ${question.answer}`);
}

// Submit grammar answer
function submitGramAnswer() {
    if (__gramIsAwaitingNext) return;
    __gramIsAwaitingNext = true;

    stopGramTimer();

    const input = document.getElementById('gramInput');
    const answer = input.value.trim().toLowerCase();

    if (!answer) {
        __gramIsAwaitingNext = false;
        return;
    }

    const question = gramCurrentQuestions[gramCurrentQuestionIndex];
    const correct = question.answer.toLowerCase();

    if (answer === correct) {
        gramScore++;
        showFeedback(true, 'Правильно!');
    } else {
        showFeedback(false, `Неправильно. Правильный ответ: ${question.answer}`);
    }
}

// Override closeModal to handle grammar flow
const originalCloseModal = closeModal;
closeModal = function() {
    document.getElementById('feedbackModal').classList.add('hidden');

    // Check if we're in grammar test
    if (!document.getElementById('gramaticaQuestionScreen').classList.contains('hidden')) {
        gramCurrentQuestionIndex++;
        showGramQuestion();
    } else {
        currentQuestionIndex++;
        showQuestion();
    }
};

// Show grammar results
function showGramResults() {
    // Тест завершён нормально — убираем флаг "в процессе"
    clearTestInProgress(gramCurrentExercise.id);

    hideAllScreens();
    showUserBadge();
    document.getElementById('gramaticaResultsScreen').classList.remove('hidden');

    const percentage = Math.round((gramScore / gramCurrentQuestions.length) * 100);

    document.getElementById('gramResultsStats').textContent =
        `Вы ответили правильно на ${gramScore} из ${gramCurrentQuestions.length}!`;

    let grade, gradeClass;
    if (percentage >= 80) {
        grade = 'Отлично! 🎉';
        gradeClass = 'grade-excellent';
    } else if (percentage >= 60) {
        grade = 'Хорошо! Попробуйте ещё раз для 80%! 👍';
        gradeClass = 'grade-good';
    } else {
        grade = 'Продолжайте стараться! 💪';
        gradeClass = 'grade-retry';
    }

    const gradeEl = document.getElementById('gramResultsGrade');
    gradeEl.textContent = grade;
    gradeEl.className = 'grade ' + gradeClass;

    // Show retry message if not passed
    const retryMsg = document.getElementById('gramRetryMessage');
    if (percentage < 80) {
        retryMsg.classList.remove('hidden');
    } else {
        retryMsg.classList.add('hidden');
    }

    // Save progress
    updateGramProgress(gramCurrentExercise.id, percentage);
}

// Update grammar progress
function updateGramProgress(exerciseId, score) {
    const profile = getActiveProfile();
    if (!profile) return;

    ensureProgressSkeleton(profile);

    const currentBest = profile.progress[currentUnidad].ejercicios[exerciseId] || 0;

    if (score > currentBest) {
        profile.progress[currentUnidad].ejercicios[exerciseId] = score;
        console.log(`Exercises progress updated: ${currentUnidad}/${exerciseId} = ${score}%`);
    }

    profile.lastSeenAt = Date.now();

    const state = loadAppState();
    state.profiles[profile.id] = profile;
    saveAppState(state);

    updateUnlocks();
}

// Retry grammar test
function retryGramTest() {
    startGramExercise(gramCurrentExercise);
}

// Exit grammar test
function exitGramTest() {
    if (confirm('Выйти из теста? Прогресс этой попытки не будет сохранён.')) {
        stopGramTimer();
        showGramaticaMenu();
    }
}
	
// ═══════════════════════════════════════════════════════════════
// GRAMMAR REFERENCE SYSTEM
// ═══════════════════════════════════════════════════════════════

let grammarData = [];
let grammarCurrentPage = 1;
const GRAMMAR_RULES_PER_PAGE = 5;
let grammarPreviousScreen = '';
let currentRule = null;
let currentSubtopicIndex = 0;

// Interactive Mode Variables
let interactiveMode = {
    active: false,
    rule: null,
    slides: [],
    currentSlideIndex: 0,
    keyboardListener: null
};

// Load Grammar JSON
async function loadGrammarData() {
    try {
        const response = await fetch('data/Grammar_Part1.json');
        const data = await response.json();
        grammarData = data.rules || [];
        console.log(`%c📚 GRAMMAR DATA LOADED`, 'background: #4CAF50; color: white; padding: 5px; font-weight: bold;');
        console.log(`   Version: ${data.version || 'unknown'}`);
        console.log(`   Total rules: ${grammarData.length}`);
        console.log(`   First rule: ${grammarData[0]?.id}`);
        console.log(`   Last rule: ${grammarData[grammarData.length - 1]?.id}`);
        if (grammarData.length < 31) {
            console.warn(`%c⚠️ WARNING: Expected 31 rules, but got ${grammarData.length}`, 'background: #FF5722; color: white; padding: 5px;');
        }
    } catch (error) {
        console.error('Error loading grammar data:', error);
        grammarData = [];
    }
}

// Show Reference Main Menu (Справочник - главное меню)
function showGrammarList() {
    // Save current screen for back navigation
    const allScreens = ['mainMenu', 'unidadMenu', 'categoryMenu', 'gramaticaMenu', 'verbMenu',
                        'questionScreen', 'resultsScreen', 'gramaticaQuestionScreen',
                        'gramaticaResultsScreen', 'verbPracticeScreen', 'qaScreen',
                        'palabrasMenu', 'groupPreviewMenu', 'miniDictionaryScreen',
                        'exercisePreviewMenu', 'grammarRuleScreen'];

    for (const screenId of allScreens) {
        const screen = document.getElementById(screenId);
        if (screen && !screen.classList.contains('hidden')) {
            grammarPreviousScreen = screenId;
            break;
        }
    }

    hideAllScreens();
    document.getElementById('referenceMainMenu').classList.remove('hidden');
}

// Show Reference Main Menu (alias)
function showReferenceMain() {
    hideAllScreens();
    document.getElementById('referenceMainMenu').classList.remove('hidden');
}

// Show Grammar Sub Menu (Gramática submenu)
function showGrammarSubMenu() {
    hideAllScreens();
    document.getElementById('grammarSubMenu').classList.remove('hidden');
}

// Show Más Gramática (список правил из grammar.json)
function showMasGramatica() {
    hideAllScreens();
    document.getElementById('grammarListScreen').classList.remove('hidden');
    grammarCurrentPage = 1;
    renderGrammarList();
}

// Check if a vocabulary group is unlocked (any difficulty >= 80%)
function isGroupUnlocked(unidadId, groupName) {
    const profile = getActiveProfile();
    if (!profile || !profile.progress) return false;

    const groupProgress = profile.progress[unidadId]?.[groupName];
    if (!groupProgress) return false;

    // Check if any difficulty level has >= 80%
    return (groupProgress.easy >= 80 || groupProgress.medium >= 80 || groupProgress.hard >= 80);
}

// Show Vocabulario - Full screen overlay with all words in grid
function showVocabularyScreen() {
    hideAllScreens();
    document.getElementById('vocabularyScreen').classList.remove('hidden');

    // Collect all words from all Unidads with icon info
    const allWords = [];
    let unlockedCount = 0;

    Object.keys(vocabularyData).forEach(unidadId => {
        const unidadData = vocabularyData[unidadId];
        if (unidadData && unidadData.groups) {
            Object.keys(unidadData.groups).forEach(groupName => {
                const words = unidadData.groups[groupName];
                const isUnlocked = isGroupUnlocked(unidadId, groupName);

                if (Array.isArray(words)) {
                    words.forEach(word => {
                        allWords.push({
                            spanish: word.spanish,
                            ru: word.ru,
                            icon: word.icon || 'book-open',
                            unidad: unidadId,
                            group: groupName,
                            unlocked: isUnlocked
                        });
                        if (isUnlocked) unlockedCount++;
                    });
                }
            });
        }
    });

    // Sort alphabetically by Spanish word (case-insensitive)
    allWords.sort((a, b) => {
        const wordA = a.spanish.toLowerCase().replace(/^(el |la |los |las )/, '');
        const wordB = b.spanish.toLowerCase().replace(/^(el |la |los |las )/, '');
        return wordA.localeCompare(wordB, 'es');
    });

    // Update word count with unlocked info
    document.getElementById('vocabularyWordCount').textContent = `${unlockedCount} / ${allWords.length} слов`;

    // Render all words in grid layout
    const container = document.getElementById('vocabularyWordsContainer');
    container.innerHTML = '';

    if (allWords.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #2c3e50; background: rgba(255,255,255,0.8); padding: 20px; border-radius: 10px;">Словарь пуст. Загрузите данные Unidads.</p>';
        return;
    }

    // Create grid wrapper
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'vocabulary-grid';

    allWords.forEach(word => {
        const wordCard = document.createElement('div');
        wordCard.className = 'vocabulary-card' + (word.unlocked ? ' clickable' : ' locked');

        // Use Phosphor icon (always visible)
        const iconHtml = `<i class="ph ph-${word.icon}" style="font-size: 28px; color: ${word.unlocked ? '#fff' : 'rgba(255,255,255,0.5)' };"></i>`;

        // Show "???" for locked words
        const spanishText = word.unlocked ? word.spanish : '???';
        const russianText = word.unlocked ? word.ru : '???';

        wordCard.innerHTML = `
            <div class="card-icon">${iconHtml}</div>
            <div class="card-spanish">${spanishText}</div>
            <div class="card-russian">${russianText}</div>
        `;

        // Add click handler for unlocked cards
        if (word.unlocked) {
            wordCard.onclick = () => expandVocabularyCard(word.icon, word.spanish, word.ru);
        }

        gridWrapper.appendChild(wordCard);
    });

    container.appendChild(gridWrapper);
}

// Hide vocabulary screen (for back button)
function hideVocabularyScreen() {
    document.getElementById('vocabularyScreen').classList.add('hidden');
}

// Expand vocabulary card (show enlarged view)
function expandVocabularyCard(icon, spanish, russian) {
    const overlay = document.getElementById('expandedCardOverlay');
    const iconEl = overlay.querySelector('.expanded-card-icon');
    const spanishEl = overlay.querySelector('.expanded-card-spanish');
    const russianEl = overlay.querySelector('.expanded-card-russian');

    iconEl.innerHTML = `<i class="ph ph-${icon}"></i>`;
    spanishEl.textContent = spanish;
    russianEl.textContent = russian;

    overlay.classList.remove('hidden');
}

// Close expanded card
function closeExpandedCard() {
    const overlay = document.getElementById('expandedCardOverlay');
    overlay.classList.add('hidden');
}

// Show Ejercicios Gramática (справочник грамматических правил из упражнений)
function showEjerciciosGramatica() {
    hideAllScreens();
    document.getElementById('ejerciciosGramaticaRefScreen').classList.remove('hidden');

    const profile = getActiveProfile();

    // Собираем все ejercicios из ВСЕХ юнидадов
    const allEjercicios = [];

    Object.keys(vocabularyData).forEach(unidadId => {
        const unidadData = vocabularyData[unidadId];
        if (unidadData && unidadData.ejercicios && Array.isArray(unidadData.ejercicios)) {
            unidadData.ejercicios.forEach(exercise => {
                // Проверяем три условия разблокировки для данной юнидад
                const ruleViewed = isRuleViewed(unidadId, exercise.id);
                const testScore = profile?.progress?.[unidadId]?.ejercicios?.[exercise.id] || 0;
                const testPassed = testScore >= 60;
                const microTestsDone = areMicroTestsCompleted(unidadId, exercise.id);

                // Правило разблокировано только если ВСЕ три условия выполнены
                const isUnlocked = ruleViewed && testPassed && microTestsDone;

                allEjercicios.push({
                    ...exercise,
                    unidadId: unidadId,
                    isUnlocked: isUnlocked
                });
            });
        }
    });

    if (allEjercicios.length === 0) {
        document.getElementById('ejerciciosGramaticaContainer').innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px;">Нет упражнений для отображения. Загрузите данные Unidads.</p>';
        document.getElementById('gramUnlockedCount').textContent = '0';
        document.getElementById('gramTotalCount').textContent = '0';
        return;
    }

    let unlockedCount = allEjercicios.filter(e => e.isUnlocked).length;
    const totalCount = allEjercicios.length;

    const container = document.getElementById('ejerciciosGramaticaContainer');
    container.innerHTML = '';

    // Create grid wrapper
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'grammar-grid';

    allEjercicios.forEach(exercise => {
        // Название правила (короткое)
        const ruleTitle = exercise.rule?.title || exercise.title;
        const shortTitle = exercise.isUnlocked ? (ruleTitle.length > 20 ? ruleTitle.substring(0, 18) + '...' : ruleTitle) : '???';

        // Создаём карточку
        const card = document.createElement('div');
        card.className = 'grammar-card' + (exercise.isUnlocked ? ' clickable' : ' locked');

        card.innerHTML = `
            <div class="card-icon"><i class="ph ph-book-open"></i></div>
            <div class="card-title">${shortTitle}</div>
            <div class="card-status">${exercise.isUnlocked ? '🔓' : '🔒'}</div>
        `;

        // Add click handler for unlocked cards
        if (exercise.isUnlocked) {
            card.onclick = () => expandGrammarCard(exercise.id, ruleTitle, exercise.rule?.explanation || '');
        }

        gridWrapper.appendChild(card);
    });

    container.appendChild(gridWrapper);

    // Обновляем счётчик
    document.getElementById('gramUnlockedCount').textContent = unlockedCount;
    document.getElementById('gramTotalCount').textContent = totalCount;
}

// Hide grammar ref screen
function hideGrammarRefScreen() {
    document.getElementById('ejerciciosGramaticaRefScreen').classList.add('hidden');
}

// Expand grammar card (show enlarged view)
function expandGrammarCard(exerciseId, title, explanation) {
    const overlay = document.getElementById('expandedGrammarCardOverlay');
    const iconEl = overlay.querySelector('.expanded-card-icon');
    const spanishEl = overlay.querySelector('.expanded-card-spanish');
    const russianEl = overlay.querySelector('.expanded-card-russian');

    iconEl.innerHTML = `<i class="ph ph-book-open"></i>`;
    spanishEl.textContent = title;
    russianEl.textContent = explanation.substring(0, 100) + (explanation.length > 100 ? '...' : '');

    overlay.classList.remove('hidden');
}

// Close expanded grammar card
function closeExpandedGrammarCard() {
    const overlay = document.getElementById('expandedGrammarCardOverlay');
    overlay.classList.add('hidden');
}

// Показать разблокированное правило из справочника
function showUnlockedRule(exerciseId) {
    if (!gramaticaExercises || gramaticaExercises.length === 0) return;

    const exercise = gramaticaExercises.find(ex => ex.id === exerciseId);
    if (!exercise || !exercise.rule) {
        alert('Правило не найдено');
        return;
    }

    // Сохраняем для навигации обратно
    currentExerciseForPreview = exercise;

    // Показываем правило (используем существующую функцию, но без сохранения ruleViewed повторно)
    showGrammarRuleFromRef(exercise);
}

// Показать правило из справочника (без изменения ruleViewed)
function showGrammarRuleFromRef(exercise) {
    const rule = exercise.rule;

    hideAllScreens();
    showUserBadge();
    document.getElementById('grammarRuleScreen').classList.remove('hidden');

    // Заголовок
    document.getElementById('grammarRuleTitle').textContent = `📖 ${rule.title}`;
    document.getElementById('grammarRuleSubtitle').textContent = exercise.title;

    // Контейнер с правилом
    const container = document.getElementById('grammarRuleContainer');

    let html = '';

    // Основное объяснение (шрифт увеличен на 35%)
    html += `
        <div style="
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 18px;
        ">
            <p style="color: #2c3e50; font-size: 1.49em; line-height: 1.7; margin: 0;">${rule.explanation}</p>
        </div>
    `;

    // Секции (если есть) - шрифт увеличен на 35%
    if (rule.sections && rule.sections.length > 0) {
        rule.sections.forEach(section => {
            html += `
                <div style="
                    background: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 12px;
                    padding: 25px;
                    margin-bottom: 18px;
                ">
                    <h3 style="color: #667eea; margin: 0 0 15px 0; font-size: 1.62em;">${section.subtitle}</h3>
                    <ul style="margin: 0; padding-left: 25px;">
                        ${section.points.map(point => `
                            <li style="color: #2c3e50; font-size: 1.35em; line-height: 1.9; margin-bottom: 8px;">${point}</li>
                        `).join('')}
                    </ul>
                </div>
            `;
        });
    }

    // Таблица (если есть)
    if (rule.table) {
        html += `
            <div style="
                background: rgba(255, 255, 255, 0.2);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 15px;
                overflow-x: auto;
            ">
                ${rule.table}
            </div>
        `;
    }

    // Примеры
    if (rule.examples && rule.examples.length > 0) {
        html += `
            <div style="
                background: rgba(39, 174, 96, 0.2);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(39, 174, 96, 0.3);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 15px;
            ">
                <h3 style="color: #27ae60; margin: 0 0 15px 0; font-size: 1.2em;">📝 Примеры</h3>
                ${rule.examples.map(ex => `
                    <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(39, 174, 96, 0.2);">
                        <div style="color: #2c3e50; font-size: 1.05em; font-weight: 600;">${ex.es}</div>
                        <div style="color: #fff; font-size: 0.95em; font-style: italic; margin-top: 4px;">${ex.ru}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    container.innerHTML = html;

    // Скрыть кнопку "Проверь себя" при просмотре из справочника
    const microTestsBtn = document.getElementById('microTestsBtn');
    if (microTestsBtn) {
        microTestsBtn.style.display = 'none';
    }

    saveNavigationState('grammarRuleScreen');
}

// Go back from Reference Main Menu
function goBackFromReference() {
    hideAllScreens();
    if (grammarPreviousScreen) {
        document.getElementById(grammarPreviousScreen).classList.remove('hidden');
    } else {
        document.getElementById('mainMenu').classList.remove('hidden');
    }
}

// Render Grammar List
function renderGrammarList() {
    const container = document.getElementById('grammarRulesContainer');
    const startIndex = (grammarCurrentPage - 1) * GRAMMAR_RULES_PER_PAGE;
    const endIndex = startIndex + GRAMMAR_RULES_PER_PAGE;
    const rulesPage = grammarData.slice(startIndex, endIndex);
    
    container.innerHTML = '';
    
    if (rulesPage.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #fff;">Нет доступных правил</p>';
        return;
    }
    
    rulesPage.forEach(rule => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.style.cursor = 'pointer';

        card.innerHTML = `
            <div class="category-header">
                <span class="category-title">📖 ${rule.topic_ru}</span>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <button
                        class="btn btn-secondary"
                        onclick="event.stopPropagation(); startInteractiveMode('${rule.id}')"
                        style="padding: 8px 15px; font-size: 0.9em; background: #667eea; color: white; border: none;"
                        title="Интерактивный режим"
                    >
                        ▶️
                    </button>
                    <span class="category-icon" onclick="showGrammarDetail('${rule.id}')">→</span>
                </div>
            </div>
            <p style="margin: 10px 0 0 0; color: #fff; font-size: 0.9em;">${rule.topic}</p>
        `;

        // Make whole card clickable to show detail
        card.onclick = (e) => {
            // Don't trigger if clicking on buttons
            if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SPAN') {
                showGrammarDetail(rule.id);
            }
        };

        container.appendChild(card);
    });
    
    updateGrammarPagination();
}

// Update Pagination Controls
function updateGrammarPagination() {
    const totalPages = Math.ceil(grammarData.length / GRAMMAR_RULES_PER_PAGE);
    const pageIndicator = document.getElementById('grammarPageIndicator');
    const prevBtn = document.getElementById('grammarPrevBtn');
    const nextBtn = document.getElementById('grammarNextBtn');
    
    pageIndicator.textContent = `Страница ${grammarCurrentPage} / ${totalPages}`;
    
    prevBtn.disabled = grammarCurrentPage === 1;
    nextBtn.disabled = grammarCurrentPage === totalPages;
    
    prevBtn.style.opacity = grammarCurrentPage === 1 ? '0.5' : '1';
    nextBtn.style.opacity = grammarCurrentPage === totalPages ? '0.5' : '1';
}

// Grammar Pagination Functions
function grammarNextPage() {
    const totalPages = Math.ceil(grammarData.length / GRAMMAR_RULES_PER_PAGE);
    if (grammarCurrentPage < totalPages) {
        grammarCurrentPage++;
        renderGrammarList();
    }
}

function grammarPrevPage() {
    if (grammarCurrentPage > 1) {
        grammarCurrentPage--;
        renderGrammarList();
    }
}

// Show Grammar Detail
function showGrammarDetail(ruleId) {
    const rule = grammarData.find(r => r.id === ruleId);
    if (!rule) {
        console.error('Rule not found:', ruleId);
        return;
    }

    currentRule = rule;
    currentSubtopicIndex = 0;

    hideAllScreens();
    document.getElementById('grammarDetailScreen').classList.remove('hidden');

    // Set title
    document.getElementById('grammarDetailTitle').textContent = `${rule.topic_ru} (${rule.topic})`;

    renderCurrentSubtopic();
    updateSubtopicPagination();
}

// Render current subtopic
function renderCurrentSubtopic() {
    if (!currentRule) return;

    const contentDiv = document.getElementById('grammarDetailContent');
    contentDiv.innerHTML = '';

    // Main explanation (always shown)
    if (currentRule.explanation_ru) {
        const explanationDiv = document.createElement('div');
        explanationDiv.style.cssText = 'margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px; line-height: 1.6;';
        explanationDiv.innerHTML = `<p style="margin: 0;">${currentRule.explanation_ru}</p>`;
        contentDiv.appendChild(explanationDiv);
    }

    // Show current subtopic
    if (currentRule.subtopics && currentRule.subtopics.length > 0 && currentSubtopicIndex < currentRule.subtopics.length) {
        const subtopic = currentRule.subtopics[currentSubtopicIndex];
        const subtopicDiv = document.createElement('div');
        subtopicDiv.style.cssText = 'margin-bottom: 25px; padding: 25px; background: white; border: 2px solid #e0e0e0; border-radius: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);';

        let html = '';

        // Subtopic title
        if (subtopic.title_ru) {
            html += `<h3 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 1.5em; font-weight: 700;">${subtopic.title_ru}</h3>`;
        }

        // Subtopic explanation
        if (subtopic.explanation_ru) {
            html += `<p style="margin: 0 0 20px 0; line-height: 1.8; font-size: 1.15em; color: #4A4A4A;">${subtopic.explanation_ru}</p>`;
        }

        // Examples
        if (subtopic.examples && subtopic.examples.length > 0) {
            html += '<div style="margin-top: 20px;">';
            html += '<h4 style="margin: 0 0 15px 0; color: #8B6914; font-size: 1.3em; font-weight: 600;">✨ Примеры:</h4>';

            subtopic.examples.forEach(example => {
                if (typeof example === 'string') {
                    html += `<div class="example">${example}</div>`;
                } else if (typeof example === 'object') {
                    if (example.rule) {
                        html += `<div style="margin: 15px 0; padding: 18px; background: #FFF9E6; border-left: 4px solid #FFD89C; border-radius: 10px;">
                            <strong style="color: #8B6914; font-size: 1.1em;">📌 Правило:</strong> <span style="color: #5A5A5A; font-size: 1.1em;">${example.rule}</span>
                        </div>`;
                    }
                    if (example.cases && example.cases.length > 0) {
                        example.cases.forEach(caseText => {
                            html += `<div class="example" style="margin-left: 20px;">${caseText}</div>`;
                        });
                    }
                }
            });

            html += '</div>';
        }

        subtopicDiv.innerHTML = html;
        contentDiv.appendChild(subtopicDiv);
    }
}

// Update subtopic pagination controls
function updateSubtopicPagination() {
    if (!currentRule || !currentRule.subtopics || currentRule.subtopics.length === 0) {
        document.getElementById('subtopicPagination').style.display = 'none';
        return;
    }

    const totalSubtopics = currentRule.subtopics.length;
    document.getElementById('subtopicPagination').style.display = 'flex';
    document.getElementById('subtopicPageIndicator').textContent = `Часть ${currentSubtopicIndex + 1} / ${totalSubtopics}`;

    const prevBtn = document.getElementById('subtopicPrevBtn');
    const nextBtn = document.getElementById('subtopicNextBtn');

    // Hide "Назад" button on first page, hide "Вперёд" button on last page
    prevBtn.style.display = currentSubtopicIndex === 0 ? 'none' : 'block';
    nextBtn.style.display = currentSubtopicIndex >= totalSubtopics - 1 ? 'none' : 'block';
}

// Navigate to previous subtopic
function prevSubtopic() {
    if (currentSubtopicIndex > 0) {
        currentSubtopicIndex--;
        renderCurrentSubtopic();
        updateSubtopicPagination();
    }
}

// Navigate to next subtopic
function nextSubtopic() {
    if (currentRule && currentRule.subtopics && currentSubtopicIndex < currentRule.subtopics.length - 1) {
        currentSubtopicIndex++;
        renderCurrentSubtopic();
        updateSubtopicPagination();
    }
}

// Go back from Grammar Reference
function goBackFromGrammar() {
    hideAllScreens();
    if (grammarPreviousScreen && document.getElementById(grammarPreviousScreen)) {
        document.getElementById(grammarPreviousScreen).classList.remove('hidden');
    } else {
        // Default fallback
        showMainMenu();
    }
}

// ═══════════════════════════════════════════════════════════════
// INTERACTIVE MODE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Split rule into slides (content blocks)
function createSlidesFromRule(rule) {
    const slides = [];

    // Slide 1: Main explanation
    if (rule.explanation_ru) {
        slides.push({
            type: 'explanation',
            content: rule.explanation_ru
        });
    }

    // Process each subtopic
    if (rule.subtopics && rule.subtopics.length > 0) {
        rule.subtopics.forEach((subtopic, subtopicIndex) => {
            // Subtopic title + explanation
            if (subtopic.title_ru || subtopic.explanation_ru) {
                let content = '';
                if (subtopic.title_ru) {
                    content += `<h3 style="color: #667eea; margin-bottom: 15px;">${subtopic.title_ru}</h3>`;
                }
                if (subtopic.explanation_ru) {
                    content += `<p>${subtopic.explanation_ru}</p>`;
                }
                slides.push({
                    type: 'subtopic-intro',
                    content: content,
                    subtopicIndex: subtopicIndex
                });
            }

            // Examples (each example as separate slide)
            if (subtopic.examples && subtopic.examples.length > 0) {
                subtopic.examples.forEach(example => {
                    if (typeof example === 'string') {
                        slides.push({
                            type: 'example',
                            content: `<div style="background: #FFF9E6; padding: 20px; border-radius: 10px; border-left: 4px solid #FFD89C;"><p style="margin: 0; font-size: 1.1em;">${example}</p></div>`,
                            subtopicIndex: subtopicIndex
                        });
                    } else if (typeof example === 'object') {
                        // Complex example with rule and cases
                        let complexContent = '';
                        if (example.rule) {
                            complexContent += `<div style="background: #FFF9E6; padding: 18px; border-radius: 10px; border-left: 4px solid #FFD89C; margin-bottom: 15px;">
                                <strong style="color: #8B6914; font-size: 1.1em;">📌 Правило:</strong>
                                <span style="color: #5A5A5A; font-size: 1.05em;">${example.rule}</span>
                            </div>`;
                        }
                        if (example.cases && example.cases.length > 0) {
                            example.cases.forEach(caseText => {
                                complexContent += `<div style="background: #F0F4FF; padding: 15px; border-radius: 8px; margin: 10px 0;">
                                    <p style="margin: 0;">${caseText}</p>
                                </div>`;
                            });
                        }
                        slides.push({
                            type: 'example-complex',
                            content: complexContent,
                            subtopicIndex: subtopicIndex
                        });
                    }
                });
            }

            // Exercise after subtopic (if exists)
            if (subtopic.exercise) {
                slides.push({
                    type: 'exercise',
                    content: subtopic.exercise,
                    subtopicIndex: subtopicIndex
                });
            }
        });
    }

    return slides;
}

// Start Interactive Mode
function startInteractiveMode(ruleId) {
    const rule = grammarData.find(r => r.id === ruleId);
    if (!rule) {
        console.error('Rule not found:', ruleId);
        return;
    }

    // Create slides from rule
    interactiveMode.rule = rule;
    interactiveMode.slides = createSlidesFromRule(rule);
    interactiveMode.currentSlideIndex = 0;
    interactiveMode.active = true;

    // Setup keyboard listener
    setupInteractiveKeyboard();

    // Show screen
    hideAllScreens();
    document.getElementById('grammarInteractiveScreen').classList.remove('hidden');
    document.getElementById('interactiveTitle').textContent = `${rule.topic_ru} (${rule.topic})`;

    // Show first slide
    showCurrentSlide();
}

// Show current slide
function showCurrentSlide() {
    const slide = interactiveMode.slides[interactiveMode.currentSlideIndex];
    const contentDiv = document.getElementById('interactiveSlideContent');
    const exerciseDiv = document.getElementById('interactiveExercise');

    if (slide.type === 'exercise') {
        // Show exercise
        contentDiv.parentElement.classList.add('hidden');
        exerciseDiv.classList.remove('hidden');
        renderExercise(slide.content);
    } else {
        // Show content slide
        contentDiv.parentElement.classList.remove('hidden');
        exerciseDiv.classList.add('hidden');
        contentDiv.innerHTML = slide.content;
    }
}

// Go to next slide
function nextSlide() {
    if (interactiveMode.currentSlideIndex < interactiveMode.slides.length - 1) {
        interactiveMode.currentSlideIndex++;
        showCurrentSlide();
    } else {
        // Finished - exit interactive mode
        exitInteractiveMode();
    }
}

// Setup keyboard listener for SPACE/ENTER
function setupInteractiveKeyboard() {
    // Remove previous listener if exists
    if (interactiveMode.keyboardListener) {
        document.removeEventListener('keydown', interactiveMode.keyboardListener);
    }

    // Create new listener
    interactiveMode.keyboardListener = function(e) {
        if (!interactiveMode.active) return;

        // Only respond to SPACE or ENTER
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();

            // Check if we're in exercise mode
            const exerciseDiv = document.getElementById('interactiveExercise');
            if (!exerciseDiv.classList.contains('hidden')) {
                // In exercise - don't advance automatically
                return;
            }

            nextSlide();
        }
    };

    document.addEventListener('keydown', interactiveMode.keyboardListener);
}

// Exit Interactive Mode
function exitInteractiveMode() {
    // Remove keyboard listener
    if (interactiveMode.keyboardListener) {
        document.removeEventListener('keydown', interactiveMode.keyboardListener);
        interactiveMode.keyboardListener = null;
    }

    // Reset state
    interactiveMode.active = false;
    interactiveMode.rule = null;
    interactiveMode.slides = [];
    interactiveMode.currentSlideIndex = 0;

    // Go back to Más Gramática list
    showMasGramatica();
}

// ═══════════════════════════════════════════════════════════════
// EXERCISE SYSTEM
// ═══════════════════════════════════════════════════════════════

let currentExercise = null;

// Render Exercise based on type
function renderExercise(exercise) {
    currentExercise = {
        data: exercise,
        answered: false,
        correct: false
    };

    const exerciseContent = document.getElementById('exerciseContent');

    // Render based on type
    switch (exercise.type) {
        case 'fill-blank':
            renderFillBlankExercise(exercise, exerciseContent);
            break;
        case 'choose-form':
            renderChooseFormExercise(exercise, exerciseContent);
            break;
        case 'accent-placement':
            renderAccentPlacementExercise(exercise, exerciseContent);
            break;
        case 'ser-or-estar':
            renderSerEstarExercise(exercise, exerciseContent);
            break;
        case 'true-false':
            renderTrueFalseExercise(exercise, exerciseContent);
            break;
        case 'match-translation':
            renderMatchTranslationExercise(exercise, exerciseContent);
            break;
        default:
            // No exercise defined
            exerciseContent.innerHTML = `
                <p style="text-align: center; color: #666;">
                    Упражнение для этой подтемы будет добавлено позже.
                </p>
                <button class="btn btn-primary" onclick="nextSlide()" style="margin-top: 20px;">
                    Продолжить →
                </button>
            `;
    }
}

// Type 1: Fill in the blank
function renderFillBlankExercise(exercise, container) {
    const { question, options, correct } = exercise;
    container.innerHTML = `
        <p style="font-size: 1.2em; text-align: center; margin-bottom: 30px;">${question}</p>
        <div style="display: flex; flex-direction: column; gap: 15px; max-width: 500px; margin: 0 auto;">
            ${options.map((option, index) => `
                <button
                    class="exercise-option btn"
                    onclick="checkFillBlankAnswer(${index})"
                    style="padding: 15px; font-size: 1.1em; text-align: left; background: white; border: 2px solid #ddd; cursor: pointer; transition: all 0.2s; color: #333;"
                    onmouseover="this.style.borderColor='#667eea'"
                    onmouseout="if(!this.classList.contains('correct') && !this.classList.contains('incorrect')) this.style.borderColor='#ddd'"
                >
                    ${String.fromCharCode(65 + index)}) ${option}
                </button>
            `).join('')}
        </div>
        <div id="exerciseFeedback" style="margin-top: 20px; text-align: center;"></div>
    `;
}

function checkFillBlankAnswer(selectedIndex) {
    if (currentExercise.answered) return;

    const { correct, explanation } = currentExercise.data;
    const options = document.querySelectorAll('.exercise-option');
    const feedback = document.getElementById('exerciseFeedback');

    currentExercise.answered = true;
    currentExercise.correct = (selectedIndex === correct);

    // Mark correct/incorrect
    options.forEach((btn, index) => {
        btn.style.pointerEvents = 'none';
        if (index === correct) {
            btn.style.borderColor = '#27ae60';
            btn.style.background = '#d5f4e6';
            btn.classList.add('correct');
        } else if (index === selectedIndex) {
            btn.style.borderColor = '#e74c3c';
            btn.style.background = '#f8d7da';
            btn.classList.add('incorrect');
        }
    });

    // Show feedback
    if (currentExercise.correct) {
        feedback.innerHTML = `
            <div style="color: #27ae60; font-size: 1.2em; margin-bottom: 10px;">✅ Правильно!</div>
            ${explanation ? `<p style="color: #666;">${explanation}</p>` : ''}
            <button class="btn btn-success" onclick="nextSlide()" style="margin-top: 15px;">Продолжить →</button>
        `;
    } else {
        feedback.innerHTML = `
            <div style="color: #e74c3c; font-size: 1.2em; margin-bottom: 10px;">❌ Неправильно</div>
            ${explanation ? `<p style="color: #666;">${explanation}</p>` : ''}
            <button class="btn btn-primary" onclick="nextSlide()" style="margin-top: 15px;">Продолжить →</button>
        `;
    }
}

// Type 2: Choose verb form (similar to fill-blank but with specific wording)
function renderChooseFormExercise(exercise, container) {
    renderFillBlankExercise(exercise, container); // Same implementation
}

// Type 3: Accent placement
function renderAccentPlacementExercise(exercise, container) {
    renderFillBlankExercise(exercise, container); // Same implementation, just shows word variants
}

// Type 4: Ser or Estar
function renderSerEstarExercise(exercise, container) {
    const { sentence, correct, explanation } = exercise;
    container.innerHTML = `
        <p style="font-size: 1.2em; text-align: center; margin-bottom: 30px;">${sentence}</p>
        <div style="display: flex; gap: 20px; justify-content: center;">
            <button
                class="exercise-option btn"
                onclick="checkSerEstarAnswer('ser')"
                style="padding: 20px 40px; font-size: 1.3em; background: white; border: 2px solid #ddd; cursor: pointer; color: #333;"
            >
                SER
            </button>
            <button
                class="exercise-option btn"
                onclick="checkSerEstarAnswer('estar')"
                style="padding: 20px 40px; font-size: 1.3em; background: white; border: 2px solid #ddd; cursor: pointer; color: #333;"
            >
                ESTAR
            </button>
        </div>
        <div id="exerciseFeedback" style="margin-top: 20px; text-align: center;"></div>
    `;
}

function checkSerEstarAnswer(selected) {
    if (currentExercise.answered) return;

    const { correct, explanation } = currentExercise.data;
    const buttons = document.querySelectorAll('.exercise-option');
    const feedback = document.getElementById('exerciseFeedback');

    currentExercise.answered = true;
    currentExercise.correct = (selected === correct);

    // Mark correct/incorrect
    buttons.forEach(btn => {
        btn.style.pointerEvents = 'none';
        const btnText = btn.textContent.trim().toLowerCase();
        if (btnText === correct) {
            btn.style.borderColor = '#27ae60';
            btn.style.background = '#d5f4e6';
        } else if (btnText === selected) {
            btn.style.borderColor = '#e74c3c';
            btn.style.background = '#f8d7da';
        }
    });

    // Show feedback
    if (currentExercise.correct) {
        feedback.innerHTML = `
            <div style="color: #27ae60; font-size: 1.2em; margin-bottom: 10px;">✅ Правильно!</div>
            ${explanation ? `<p style="color: #666;">${explanation}</p>` : ''}
            <button class="btn btn-success" onclick="nextSlide()" style="margin-top: 15px;">Продолжить →</button>
        `;
    } else {
        feedback.innerHTML = `
            <div style="color: #e74c3c; font-size: 1.2em; margin-bottom: 10px;">❌ Неправильно</div>
            ${explanation ? `<p style="color: #666;">${explanation}</p>` : ''}
            <button class="btn btn-primary" onclick="nextSlide()" style="margin-top: 15px;">Продолжить →</button>
        `;
    }
}

// Type 5: True/False
function renderTrueFalseExercise(exercise, container) {
    const { statement, correct, explanation } = exercise;
    container.innerHTML = `
        <p style="font-size: 1.2em; text-align: center; margin-bottom: 30px;">${statement}</p>
        <div style="display: flex; gap: 20px; justify-content: center;">
            <button
                class="exercise-option btn"
                onclick="checkTrueFalseAnswer(true)"
                style="padding: 20px 40px; font-size: 1.3em; background: white; border: 2px solid #ddd; cursor: pointer; color: #333;"
            >
                ✓ Правда
            </button>
            <button
                class="exercise-option btn"
                onclick="checkTrueFalseAnswer(false)"
                style="padding: 20px 40px; font-size: 1.3em; background: white; border: 2px solid #ddd; cursor: pointer; color: #333;"
            >
                ✗ Ложь
            </button>
        </div>
        <div id="exerciseFeedback" style="margin-top: 20px; text-align: center;"></div>
    `;
}

function checkTrueFalseAnswer(selected) {
    if (currentExercise.answered) return;

    const { correct, explanation } = currentExercise.data;
    const buttons = document.querySelectorAll('.exercise-option');
    const feedback = document.getElementById('exerciseFeedback');

    currentExercise.answered = true;
    currentExercise.correct = (selected === correct);

    // Mark correct/incorrect
    buttons[0].style.pointerEvents = 'none';
    buttons[1].style.pointerEvents = 'none';

    if (correct) {
        buttons[0].style.borderColor = '#27ae60';
        buttons[0].style.background = '#d5f4e6';
        if (!currentExercise.correct) {
            buttons[1].style.borderColor = '#e74c3c';
            buttons[1].style.background = '#f8d7da';
        }
    } else {
        buttons[1].style.borderColor = '#27ae60';
        buttons[1].style.background = '#d5f4e6';
        if (!currentExercise.correct) {
            buttons[0].style.borderColor = '#e74c3c';
            buttons[0].style.background = '#f8d7da';
        }
    }

    // Show feedback
    if (currentExercise.correct) {
        feedback.innerHTML = `
            <div style="color: #27ae60; font-size: 1.2em; margin-bottom: 10px;">✅ Правильно!</div>
            ${explanation ? `<p style="color: #666;">${explanation}</p>` : ''}
            <button class="btn btn-success" onclick="nextSlide()" style="margin-top: 15px;">Продолжить →</button>
        `;
    } else {
        feedback.innerHTML = `
            <div style="color: #e74c3c; font-size: 1.2em; margin-bottom: 10px;">❌ Неправильно</div>
            ${explanation ? `<p style="color: #666;">${explanation}</p>` : ''}
            <button class="btn btn-primary" onclick="nextSlide()" style="margin-top: 15px;">Продолжить →</button>
        `;
    }
}

// Type 6: Match translation
function renderMatchTranslationExercise(exercise, container) {
    renderFillBlankExercise(exercise, container); // Same as multiple choice
}

// ═══════════════════════════════════════════════════════════════
// SMART CONTINUE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Умный переход для Card Matching (Palabras)
// Если словарь следующей группы не просмотрен - открываем превью группы
// Если уже просмотрен - сразу на тест
function goToNextTestSmart() {
    if (!currentUnidad || !currentCategory) {
        showPalabrasMenu();
        return;
    }

    const unidadData = vocabularyData[currentUnidad];
    if (!unidadData || !unidadData.groups) {
        showPalabrasMenu();
        return;
    }

    const groupSize = unidadData.groups[currentCategory]?.length || 0;

    // Для групп 10+ слов - проверяем следующий уровень (тут не нужна проверка словаря)
    if (groupSize >= 10 && currentLevel) {
        const levels = ['easy', 'medium', 'hard'];
        const currentLevelIndex = levels.indexOf(currentLevel);

        if (currentLevelIndex >= 0 && currentLevelIndex < levels.length - 1) {
            // Есть следующий уровень - запускаем его
            const nextLevel = levels[currentLevelIndex + 1];
            startTest(nextLevel);
            return;
        }
    }

    // Переходим к следующей группе
    const groupNames = Object.keys(unidadData.groups);
    const currentIndex = groupNames.indexOf(currentCategory);

    if (currentIndex >= 0 && currentIndex < groupNames.length - 1) {
        const nextGroup = groupNames[currentIndex + 1];

        // Проверяем, был ли просмотрен словарь для следующей группы
        const wordsViewed = isWordsViewed(currentUnidad, nextGroup);

        // Устанавливаем следующую группу как текущую
        currentCategory = nextGroup;

        if (wordsViewed) {
            // Словарь уже просмотрен - сразу на тест
            showCategoryMenu(nextGroup);
        } else {
            // Словарь не просмотрен - сразу открываем словарь
            showMiniDictionary();
        }
    } else {
        // Это последняя группа - возвращаемся в меню
        showPalabrasMenu();
    }
}

// Умный переход для Ejercicios (Grammar)
// Если правило следующего упражнения не просмотрено - открываем правило
// Если уже просмотрено - сразу на тест
function goToNextExerciseSmart() {
    if (!currentUnidad || !gramCurrentExercise) {
        showGramaticaMenu();
        return;
    }

    // Находим индекс текущего упражнения
    const currentIndex = gramaticaExercises.findIndex(ex => ex.id === gramCurrentExercise.id);

    if (currentIndex === -1 || currentIndex >= gramaticaExercises.length - 1) {
        // Это последнее упражнение или не найдено - возвращаемся в меню
        showGramaticaMenu();
        return;
    }

    // Получаем следующее упражнение
    const nextExercise = gramaticaExercises[currentIndex + 1];

    // Проверяем, было ли просмотрено правило для следующего упражнения
    const ruleViewed = isRuleViewed(currentUnidad, nextExercise.id);

    // Устанавливаем следующее упражнение как текущее
    currentExerciseForPreview = nextExercise;
    gramCurrentExercise = nextExercise;

    if (ruleViewed) {
        // Правило уже просмотрено - показываем превью (там проверяются микро-тесты)
        showExercisePreview(nextExercise);
    } else {
        // Правило не просмотрено - открываем правило
        showGrammarRule();
    }
}

// Initialize Grammar Data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadGrammarData();
});
