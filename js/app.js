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
                                easy10: 0, easy25: 0,
                                medium10: 0, medium25: 0,
                                hard10: 0, hard25: 0
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

        function updateProgress(unidad, category, level, count, score) {
            const profile = getActiveProfile();
            if (!profile) return;

            ensureProgressSkeleton(profile);

            const key = `${level}${count}`;
            const currentBest = profile.progress[unidad][category][key] || 0;
            const newScore = Math.round(score);
            
            if (newScore > currentBest) {
                profile.progress[unidad][category][key] = newScore;
                if (DEBUG) console.log(`Progress updated: ${unidad}/${category}/${key} = ${newScore}%`);
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
            const scores = Object.values(categoryData);
            const sum = scores.reduce((a, b) => a + b, 0);
            const avg = sum / scores.length;
            return Math.round(avg);
        }

        function calculateUnidadProgress(unidad, profile = null) {
            if (!profile) {
                profile = getActiveProfile();
            }
            if (!profile) return 0;

            ensureProgressSkeleton(profile);

            let totalProgress = 0;
            let groupCount = 0;

            // Динамически подсчитываем прогресс для всех групп
            const unidadData = vocabularyData[unidad];
            if (unidadData && unidadData.groups) {
                Object.keys(unidadData.groups).forEach(groupName => {
                    totalProgress += calculateCategoryProgress(unidad, groupName, profile);
                    groupCount++;
                });
            }

            // Include exercises progress if exercises exist
            const exercisesProgress = calculateGramaticaProgressForUnidad(unidad);
            if (exercisesProgress !== null) {
                totalProgress += exercisesProgress;
                return Math.round(totalProgress / (groupCount + 1));
            }

            return groupCount > 0 ? Math.round(totalProgress / groupCount) : 0;
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
        }

        // ═══════════════════════════════════════════════════════════════
        // UI NAVIGATION
        // ═══════════════════════════════════════════════════════════════

        function hideAll() {
            ['startScreen', 'profileSelectScreen', 'profileCreateScreen',
             'mainMenu', 'unidadMenu', 'categoryMenu', 'questionScreen',
             'resultsScreen', 'verbMenu', 'verbPracticeScreen', 'qaScreen',
			 'gramaticaMenu', 'gramaticaQuestionScreen', 'gramaticaResultsScreen',
             'grammarListScreen', 'grammarDetailScreen',
             'examScreen', 'examResultsScreen'].forEach(id => {
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

            // Update Exam Button
            updateExamButton();
        }

        function updateExamButton() {
            const profile = getActiveProfile();
            if (!profile) return;

            const examBtn = document.getElementById('examBtn');
            const examRequirement = document.querySelector('.exam-requirement');

            if (!examBtn) return;

            // Динамический расчёт среднего прогресса по всем разблокированным unidades
            let totalProgress = 0;
            let unidadCount = 0;

            UNIDADES.forEach((unidad, index) => {
                // Первая unidad всегда учитывается, остальные - только если разблокированы
                if (index === 0 || profile.unlocks[unidad]) {
                    totalProgress += calculateUnidadProgress(unidad);
                    unidadCount++;
                }
            });

            const averageProgress = unidadCount > 0 ? Math.round(totalProgress / unidadCount) : 0;

            // Unlock exam if average progress >= 80%
            if (averageProgress >= 80) {
                examBtn.disabled = false;
                examBtn.classList.remove('btn-warning');
                examBtn.classList.add('btn-primary');
                if (examRequirement) {
                    examRequirement.textContent = `Средний прогресс: ${averageProgress}% ✅`;
                    examRequirement.style.color = '#4CAF50';
                }
            } else {
                examBtn.disabled = true;
                examBtn.classList.remove('btn-primary');
                examBtn.classList.add('btn-warning');
                if (examRequirement) {
                    examRequirement.textContent = `Требуется средний прогресс 80% (сейчас: ${averageProgress}%)`;
                    examRequirement.style.color = '#666';
                }
            }
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

        // Timer variables
        let timerInterval = null;
        let timeLeft = 10;
        const TIMER_DURATION = 10;

        // Exam variables
        let examQuestions = [];
        let examCurrentIndex = 0;
        let examScore = 0;
        let examAnswers = [];
        let examStartTime = null;
        let examTimerInterval = null;
        let breakTimerInterval = null;
        let breakTimeLeft = 30;
        let breaksTaken = new Set(); // Track which breaks have been shown
        let resultsCurrentPage = 0; // For pagination in results
        const EXAM_QUESTIONS_COUNT = 60;
        const EXAM_TIMER_DURATION = 15;
        const BREAK_DURATION = 30; // 30 seconds break
        const RESULTS_PER_PAGE = 10; // Show 10 results per page

        // Grammar clusters for exam
        const GRAMMAR_CLUSTERS = {
            unidad_1: [
                {
                    name: "Предлоги",
                    exercises: ["ejercicio_1", "ejercicio_2"] // con/en/entre, porque/para
                },
                {
                    name: "Presente de indicativo",
                    exercises: ["ejercicio_3", "ejercicio_7"] // базовые формы, возвратные
                },
                {
                    name: "Desde / desde hace",
                    exercises: ["ejercicio_4"] // только одно упражнение
                },
                {
                    name: "Ser/estar/sentirse",
                    exercises: ["ejercicio_5"] // только одно упражнение
                },
                {
                    name: "Согласование глагола",
                    exercises: ["ejercicio_8", "ejercicio_9"] // me cuesta/cuestan, me da/dan
                },
                {
                    name: "Рекомендации и состояния",
                    exercises: ["ejercicio_6", "ejercicio_10"] // tienes que/lo mejor es, me cuesta/me da miedo
                }
            ]
        };

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

            // Exam button
            const examBtn = document.getElementById('examBtn');
            if (avgProgress >= 80) {
                examBtn.disabled = false;
                examBtn.textContent = '🔓 Пройти экзамен';
                examBtn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
            } else {
                examBtn.disabled = true;
                examBtn.textContent = `🔒 Пройти экзамен (${avgProgress}%, требуется 80%)`;
                examBtn.style.background = '#95a5a6';
            }

            // Update Palabras progress bar in unidadMenu
            const palabrasProgress = calculatePalabrasProgress(currentUnidad);
            const palabrasBar = document.getElementById('palabras-progress-bar');
            const palabrasText = document.getElementById('palabras-progress-text');
            if (palabrasBar) palabrasBar.style.width = palabrasProgress + '%';
            if (palabrasText) palabrasText.textContent = palabrasProgress + '%';
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

            hideAll();
            showUserBadge();
            document.getElementById('palabrasMenu').classList.remove('hidden');

            // Render group cards dynamically
            renderGroupCards();

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

            groupNames.forEach(groupName => {
                const card = document.createElement('div');
                card.className = 'category-card';
                card.onclick = () => showCategoryMenu(groupName);

                // Используем название группы как заголовок
                const displayName = groupName.replace(/_/g, ' ');
                const wordsCount = unidadData.groups[groupName].length;

                // Calculate progress for this group
                const progress = calculateCategoryProgress(currentUnidad, groupName, profile);

                card.innerHTML = `
                    <div class="category-header">
                        <span class="category-title">${displayName}</span>
                        <span class="category-icon">📝 ${wordsCount} слов</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${progress}%"></div>
                    </div>
                    <p class="progress-text">${progress}%</p>
                `;

                container.appendChild(card);
            });

            console.log(`✅ Rendered ${groupNames.length} group cards in Palabras menu`);
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
            const wordsCount = groupSize;
            const title = `${displayName} (${wordsCount} слов)`;
            document.getElementById('categoryTitle').textContent = title;

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
  saveProfiles();
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
                    cardMatchingProgress.textContent = `Лучший: ${categoryData.easy10}%`;

                    // Change button color based on score
                    if (categoryData.easy10 >= 80) {
                        cardMatchingBtn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
                    } else if (categoryData.easy10 > 0) {
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
            // EASY LEVEL
            // ═══════════════════════════════════════════════════════════════
            const easy10Btn = document.getElementById('easy-10-btn');
            const easy25Btn = document.getElementById('easy-25-btn');
            
            easy10Btn.disabled = false;
            easy10Btn.style.opacity = '1';
            easy10Btn.querySelector('.level-btn-label').textContent = `✓ 10 вопросов [${categoryData.easy10}%]`;
            easy10Btn.querySelector('.level-btn-progress').textContent = '';
            
            // Change button color based on score
            if (categoryData.easy10 >= 80) {
                easy10Btn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
            } else if (categoryData.easy10 > 0) {
                easy10Btn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
            } else {
                easy10Btn.style.background = '#27ae60';
            }
            
            // easy25 unlocks when easy10 >= 80%
            if (categoryData.easy10 >= 80) {
                easy25Btn.disabled = false;
                easy25Btn.style.opacity = '1';
                easy25Btn.querySelector('.level-btn-label').textContent = `✓ 25 вопросов [${categoryData.easy25}%]`;
                easy25Btn.querySelector('.level-btn-progress').textContent = '';
                
                if (categoryData.easy25 >= 80) {
                    easy25Btn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
                } else if (categoryData.easy25 > 0) {
                    easy25Btn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
                } else {
                    easy25Btn.style.background = '#27ae60';
                }
            } else {
                easy25Btn.disabled = true;
                easy25Btn.style.opacity = '0.5';
                easy25Btn.querySelector('.level-btn-label').textContent = '🔒 25 вопросов';
                easy25Btn.querySelector('.level-btn-progress').textContent = '(требуется 80% на 10)';
                easy25Btn.style.background = '';
            }

            // ═══════════════════════════════════════════════════════════════
            // MEDIUM LEVEL - unlocks when BOTH easy10 AND easy25 >= 80%
            // ═══════════════════════════════════════════════════════════════
            const medium10Btn = document.getElementById('medium-10-btn');
            const medium25Btn = document.getElementById('medium-25-btn');
            
            const easyCompleted = categoryData.easy10 >= 80 && categoryData.easy25 >= 80;
            
            if (easyCompleted) {
                medium10Btn.disabled = false;
                medium10Btn.style.opacity = '1';
                medium10Btn.querySelector('.level-btn-label').textContent = `✓ 10 вопросов [${categoryData.medium10}%]`;
                medium10Btn.querySelector('.level-btn-progress').textContent = '';
                
                if (categoryData.medium10 >= 80) {
                    medium10Btn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
                } else if (categoryData.medium10 > 0) {
                    medium10Btn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
                } else {
                    medium10Btn.style.background = '#f39c12';
                }
                
                // medium25 unlocks when medium10 >= 80%
                if (categoryData.medium10 >= 80) {
                    medium25Btn.disabled = false;
                    medium25Btn.style.opacity = '1';
                    medium25Btn.querySelector('.level-btn-label').textContent = `✓ 25 вопросов [${categoryData.medium25}%]`;
                    medium25Btn.querySelector('.level-btn-progress').textContent = '';
                    
                    if (categoryData.medium25 >= 80) {
                        medium25Btn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
                    } else if (categoryData.medium25 > 0) {
                        medium25Btn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
                    } else {
                        medium25Btn.style.background = '#f39c12';
                    }
                } else {
                    medium25Btn.disabled = true;
                    medium25Btn.style.opacity = '0.5';
                    medium25Btn.querySelector('.level-btn-label').textContent = '🔒 25 вопросов';
                    medium25Btn.querySelector('.level-btn-progress').textContent = '(требуется 80% на 10)';
                    medium25Btn.style.background = '';
                }
            } else {
                medium10Btn.disabled = true;
                medium10Btn.style.opacity = '0.5';
                medium10Btn.querySelector('.level-btn-label').textContent = '🔒 10 вопросов';
                medium10Btn.querySelector('.level-btn-progress').textContent = '(требуется 80% на Лёгкий)';
                medium10Btn.style.background = '';
                
                medium25Btn.disabled = true;
                medium25Btn.style.opacity = '0.5';
                medium25Btn.querySelector('.level-btn-label').textContent = '🔒 25 вопросов';
                medium25Btn.querySelector('.level-btn-progress').textContent = '';
                medium25Btn.style.background = '';
            }

            // ═══════════════════════════════════════════════════════════════
            // HARD LEVEL - unlocks when BOTH medium10 AND medium25 >= 80%
            // ═══════════════════════════════════════════════════════════════
            const hard10Btn = document.getElementById('hard-10-btn');
            const hard25Btn = document.getElementById('hard-25-btn');
            
            const mediumCompleted = categoryData.medium10 >= 80 && categoryData.medium25 >= 80;
            
            if (mediumCompleted) {
                hard10Btn.disabled = false;
                hard10Btn.style.opacity = '1';
                hard10Btn.querySelector('.level-btn-label').textContent = `✓ 10 вопросов [${categoryData.hard10}%]`;
                hard10Btn.querySelector('.level-btn-progress').textContent = '';
                
                if (categoryData.hard10 >= 80) {
                    hard10Btn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
                } else if (categoryData.hard10 > 0) {
                    hard10Btn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
                } else {
                    hard10Btn.style.background = '#e74c3c';
                }
                
                // hard25 unlocks when hard10 >= 80%
                if (categoryData.hard10 >= 80) {
                    hard25Btn.disabled = false;
                    hard25Btn.style.opacity = '1';
                    hard25Btn.querySelector('.level-btn-label').textContent = `✓ 25 вопросов [${categoryData.hard25}%]`;
                    hard25Btn.querySelector('.level-btn-progress').textContent = '';
                    
                    if (categoryData.hard25 >= 80) {
                        hard25Btn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
                    } else if (categoryData.hard25 > 0) {
                        hard25Btn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
                    } else {
                        hard25Btn.style.background = '#e74c3c';
                    }
                } else {
                    hard25Btn.disabled = true;
                    hard25Btn.style.opacity = '0.5';
                    hard25Btn.querySelector('.level-btn-label').textContent = '🔒 25 вопросов';
                    hard25Btn.querySelector('.level-btn-progress').textContent = '(требуется 80% на 10)';
                    hard25Btn.style.background = '';
                }
            } else {
                hard10Btn.disabled = true;
                hard10Btn.style.opacity = '0.5';
                hard10Btn.querySelector('.level-btn-label').textContent = '🔒 10 вопросов';
                hard10Btn.querySelector('.level-btn-progress').textContent = '(требуется 80% на Средний)';
                hard10Btn.style.background = '';
                
                hard25Btn.disabled = true;
                hard25Btn.style.opacity = '0.5';
                hard25Btn.querySelector('.level-btn-label').textContent = '🔒 25 вопросов';
                hard25Btn.querySelector('.level-btn-progress').textContent = '';
                hard25Btn.style.background = '';
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

        function startTest(level, count) {
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

            if (words.length < count) {
                alert(`Внимание: в категории всего ${words.length} слов(а), но запрошено ${count}.\nБудет показано ${words.length} вопросов.`);
                count = words.length;
            }

            currentLevel = level;
            currentCount = count;
            currentQuestionIndex = 0;
            score = 0;

            const shuffled = shuffleArray(words);
            currentQuestions = shuffled.slice(0, count);

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
            timeLeft = TIMER_DURATION;
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

            const percentage = (timeLeft / TIMER_DURATION) * 100;
            timerBar.style.width = percentage + '%';
            timerText.textContent = Math.ceil(timeLeft);

            // Remove all color classes
            timerBar.classList.remove('timer-warning', 'timer-danger');
            timerText.classList.remove('timer-text-warning', 'timer-text-danger');

            // Add color based on time left
            if (timeLeft <= 3) {
                timerBar.classList.add('timer-danger');
                timerText.classList.add('timer-text-danger');
            } else if (timeLeft <= 5) {
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
                document.getElementById('questionText').textContent = question.spanish;
                showMultipleChoice(question, 'easy');
            } else if (currentLevel === 'medium') {
                // Medium: RU→ES, ABCD
                document.getElementById('questionText').textContent = question.ru;
                showMultipleChoice(question, 'medium');
            } else if (currentLevel === 'hard') {
                // Hard: RU→ES, Manual Input
                document.getElementById('questionText').textContent = question.ru;
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
            updateProgress(currentUnidad, currentCategory, currentLevel, currentCount, percentage);
            
            // Update UI to reflect new progress
            updateCategoryButtons();
            updateUnidadProgressBars();
            updateUnidadUI();
        }

        function retryTest() {
            startTest(currentLevel, currentCount);
        }

        function exitTest() {
            if (confirm('Выйти из теста? Прогресс этой попытки не будет сохранён.')) {
                stopTimer();
                showCategoryMenu(currentCategory);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // CARD MATCHING GAME SYSTEM (Pair Matching with Icons)
        // ═══════════════════════════════════════════════════════════════

        let leftWords = [];   // Russian words
        let rightWords = [];  // Spanish words (including 2 decoys)
        let selectedLeft = null;   // Index of selected left card
        let selectedRight = null;  // Index of selected right card
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

            // Card front (shows text)
            const front = document.createElement('div');
            front.className = 'card-front';
            front.innerHTML = `
                <div class="card-text">
                    ${side === 'left' ? word.ru : word.spanish}
                </div>
            `;

            // Card back (shows icon - hidden initially)
            const back = document.createElement('div');
            back.className = 'card-back hidden';

            // Get Phosphor icon
            const iconName = word.icon || 'question';
            back.innerHTML = `
                <i class="ph ph-${iconName}" style="font-size: 48px;"></i>
                <div style="margin-top: 10px; font-size: 0.9em;">${side === 'left' ? word.ru : word.spanish}</div>
            `;

            card.appendChild(front);
            card.appendChild(back);

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

            const leftCard = document.getElementById(`left-${selectedLeft}`);
            const rightCard = document.getElementById(`right-${selectedRight}`);

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
                        leftCard.style.opacity = '0';
                        rightCard.style.opacity = '0';

                        selectedLeft = null;
                        selectedRight = null;
                        isAnimating = false;

                        // Check if game finished
                        if (matchedPairs.size === leftWords.length) {
                            finishGame();
                        }
                    }, 1000); // Wait 1s before fading
                } else {
                    // Wrong match - red burn and flip back
                    leftCard.classList.add('incorrect');
                    rightCard.classList.add('incorrect');

                    setTimeout(() => {
                        leftCard.classList.remove('incorrect', 'selected');
                        rightCard.classList.remove('incorrect', 'selected');

                        flipCard(leftCard, false);
                        flipCard(rightCard, false);

                        selectedLeft = null;
                        selectedRight = null;
                        isAnimating = false;
                    }, 2000);
                }
            }, 600); // Wait for flip animation
        }

        function flipCard(card, showBack) {
            const front = card.querySelector('.card-front');
            const back = card.querySelector('.card-back');

            if (showBack) {
                front.classList.add('hidden');
                back.classList.remove('hidden');
                card.classList.add('flipped');
            } else {
                front.classList.remove('hidden');
                back.classList.add('hidden');
                card.classList.remove('flipped');
            }
        }

        function finishGame() {
            const totalPairs = leftWords.length;
            const percentage = Math.round((correctMatches / totalPairs) * 100);

            // Save progress
            const profile = getActiveProfile();
            if (profile) {
                ensureProgressSkeleton(profile);
                if (!profile.progress[currentUnidad][currentCategory]) {
                    profile.progress[currentUnidad][currentCategory] = {
                        easy10: 0, easy25: 0,
                        medium10: 0, medium25: 0,
                        hard10: 0, hard25: 0
                    };
                }

                profile.progress[currentUnidad][currentCategory].easy10 = percentage;

                const state = loadAppState();
                state.profiles[profile.id] = profile;
                saveAppState(state);

                updateUnlocks();
            }

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
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
                        <h3 style="margin-top: 0; color: #333;">📊 Результат:</h3>
                        <p style="color: #27ae60; margin: 10px 0;">
                            ✓ Правильно: <strong>${correctMatches}</strong> из ${totalPairs}
                        </p>
                        <p style="color: #333; margin: 10px 0;">
                            Процент: <strong>${percentage}%</strong>
                        </p>
                    </div>
                `;

                saveNavigationState('cardMatchingResultsScreen');
            }, 1500);
        }

        function retryCardMatching() {
            startCardMatchingGame();
        }

        function exitCardMatching() {
            showCategoryMenu(currentCategory);
        }

        // ═══════════════════════════════════════════════════════════════
        // EXAM SYSTEM
        // ═══════════════════════════════════════════════════════════════

        async function startExam() {
            const profile = getActiveProfile();
            if (!profile) return;

            // Загрузка данных из всех разблокированных unidades
            try {
                const allGroupsData = {}; // Динамический объект для всех групп

                for (const [index, unidad] of UNIDADES.entries()) {
                    // Первая unidad всегда загружается, остальные - только если разблокированы
                    if (index === 0 || profile.unlocks[unidad]) {
                        const unidadData = vocabularyData[unidad];

                        if (unidadData && unidadData.groups) {
                            // Объединяем данные из всех групп всех разблокированных unidades
                            Object.keys(unidadData.groups).forEach(groupName => {
                                if (!allGroupsData[groupName]) {
                                    allGroupsData[groupName] = [];
                                }
                                allGroupsData[groupName].push(...unidadData.groups[groupName]);
                            });
                        }
                    }
                }

                window.examUnidadData = allGroupsData;
            } catch (error) {
                console.error('Error loading exam data:', error);
                alert('Ошибка загрузки данных для экзамена');
                return;
            }

            // Generate exam questions
            examQuestions = generateExamQuestions();
            console.log(`Total exam questions generated: ${examQuestions.length}`);

            if (examQuestions.length === 0) {
                alert('Ошибка: не удалось сгенерировать вопросы для экзамена');
                return;
            }

            examCurrentIndex = 0;
            examScore = 0;
            examAnswers = [];
            breaksTaken.clear(); // Reset breaks tracker
            examStartTime = Date.now();

            // Show exam screen
            hideAllScreens();
            document.getElementById('examScreen').classList.remove('hidden');

            // Start first question
            showExamQuestion();
        }

        // Get 5 questions from a grammar cluster
        function get5QuestionsFromCluster(cluster, unidadData) {
            console.log(`get5QuestionsFromCluster called for: ${cluster.name}`);
            console.log('Cluster exercises:', cluster.exercises);

            if (!unidadData || !unidadData.ejercicios) {
                console.error('No grammar data available in unidadData.ejercicios');
                console.log('unidadData:', unidadData);
                return [];
            }

            const allGrammarExercises = unidadData.ejercicios;
            console.log(`Total grammar exercises in data: ${allGrammarExercises.length}`);
            const clusterQuestions = [];
            const questionCounts = {}; // Track how many questions taken from each exercise

            // Get exercises for this cluster
            const exerciseIds = cluster.exercises;
            const availableExercises = exerciseIds
                .map(id => {
                    const found = allGrammarExercises.find(ex => ex.id === id);
                    console.log(`Looking for ${id}: ${found ? 'found' : 'NOT FOUND'}`);
                    return found;
                })
                .filter(ex => ex && ex.questions && ex.questions.length > 0);

            console.log(`Found ${availableExercises.length} available exercises for cluster ${cluster.name}`);

            if (availableExercises.length === 0) {
                console.warn(`No exercises found for cluster: ${cluster.name}`);
                return [];
            }

            // If only one exercise, take 5 questions from it
            if (availableExercises.length === 1) {
                const exercise = availableExercises[0];
                console.log(`Single exercise mode: ${exercise.id} has ${exercise.questions.length} questions`);
                const shuffled = [...exercise.questions].sort(() => Math.random() - 0.5);
                const selected = shuffled.slice(0, 5).map(q => ({
                    ...q,
                    type: 'grammar',
                    cluster: cluster.name,
                    hint: exercise.hint
                }));
                console.log(`Returning ${selected.length} questions from single exercise`);
                return selected;
            }

            // Multiple exercises: take max 2 from each
            const maxPerExercise = 2;
            let attempts = 0;
            const maxAttempts = 100;

            while (clusterQuestions.length < 5 && attempts < maxAttempts) {
                attempts++;

                // Pick random exercise
                const randomExercise = availableExercises[Math.floor(Math.random() * availableExercises.length)];
                const exerciseId = randomExercise.id;

                // Initialize counter
                if (!questionCounts[exerciseId]) {
                    questionCounts[exerciseId] = 0;
                }

                // Check if we can still take from this exercise
                if (questionCounts[exerciseId] < maxPerExercise) {
                    // Get random question that hasn't been used
                    const availableQuestions = randomExercise.questions.filter(q =>
                        !clusterQuestions.some(cq => cq.sentence === q.sentence)
                    );

                    if (availableQuestions.length > 0) {
                        const randomQuestion = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
                        clusterQuestions.push({
                            ...randomQuestion,
                            type: 'grammar',
                            cluster: cluster.name,
                            hint: randomExercise.hint
                        });
                        questionCounts[exerciseId]++;
                    }
                }
            }

            return clusterQuestions;
        }

        function generateExamQuestions() {
            const unidadData = window.examUnidadData;

            if (!unidadData) {
                console.error('No exam data available');
                return [];
            }

            const examQuestions = [];

            // ========================================
            // PART 1: VOCABULARY (30 questions)
            // ========================================
            const questionsPerCategory = 10;

            // Генерация вопросов из всех групп
            const allGroupNames = Object.keys(unidadData);
            allGroupNames.forEach(groupName => {
                const groupItems = unidadData[groupName];

                if (!groupItems || groupItems.length === 0) {
                    console.warn(`Group ${groupName} is empty`);
                    return;
                }

                // Перемешиваем и берём 10 вопросов из объединённых данных всех unidades
                const shuffled = [...groupItems].sort(() => Math.random() - 0.5);
                const selected = shuffled.slice(0, Math.min(questionsPerCategory, groupItems.length));

                selected.forEach(item => {
                    examQuestions.push({
                        spanish: item.spanish,
                        ru: item.ru,
                        category: groupName,
                        type: 'vocabulary',
                        correctAnswer: item.ru
                    });
                });
            });

            // Перемешиваем все вопросы для смешивания категорий
            return examQuestions.sort(() => Math.random() - 0.5);
        }

        function showExamQuestion() {
            if (examCurrentIndex >= examQuestions.length) {
                showExamResults();
                return;
            }

            // Check if we need a break (after questions 10, 20, 30) and haven't shown it yet
            if (examCurrentIndex > 0 && examCurrentIndex % 10 === 0 && !breaksTaken.has(examCurrentIndex)) {
                breaksTaken.add(examCurrentIndex);
                startBreak();
                return;
            }

            const question = examQuestions[examCurrentIndex];

            // Update progress
            document.getElementById('examProgress').textContent =
                `Вопрос ${examCurrentIndex + 1} из ${EXAM_QUESTIONS_COUNT}`;

            // Show different UI based on question type
            if (question.type === 'grammar') {
                // Grammar question: show sentence with blank
                document.getElementById('examQuestionText').textContent = question.sentence;
                document.getElementById('examCategoryHint').textContent = question.hint || '';
                document.getElementById('examAnswerInput').placeholder = 'Введите пропущенное слово...';
            } else {
                // Vocabulary question: show Spanish word
                document.getElementById('examQuestionText').textContent = question.spanish;

                // Используем CATEGORY_CONFIG для hint
                const hint = CATEGORY_CONFIG[question.category]?.hint || '';
                document.getElementById('examCategoryHint').textContent = hint;
                document.getElementById('examAnswerInput').placeholder = 'Введите перевод на русский...';
            }

            // Clear and focus input
            const input = document.getElementById('examAnswerInput');
            input.value = '';
            input.disabled = false;
            input.focus();

            // Start timer
            timeLeft = EXAM_TIMER_DURATION;
            updateExamTimer();
            clearInterval(examTimerInterval);
            examTimerInterval = setInterval(updateExamTimer, 1000);
        }

        function updateExamTimer() {
            const timerText = document.getElementById('examTimerText');
            const timerBar = document.getElementById('examTimerBar');

            timerText.textContent = timeLeft;
            const percentage = (timeLeft / EXAM_TIMER_DURATION) * 100;
            timerBar.style.width = percentage + '%';

            if (timeLeft <= 0) {
                clearInterval(examTimerInterval);
                handleExamAnswer(null); // No answer selected
            } else {
                timeLeft--;
            }
        }

        function startBreak() {
            // Hide exam screen, show break screen
            document.getElementById('examScreen').classList.add('hidden');
            document.getElementById('breakScreen').classList.remove('hidden');

            // Reset break timer
            breakTimeLeft = BREAK_DURATION;
            document.getElementById('breakTimerDisplay').textContent = breakTimeLeft;

            // Start countdown
            clearInterval(breakTimerInterval);
            breakTimerInterval = setInterval(() => {
                breakTimeLeft--;
                document.getElementById('breakTimerDisplay').textContent = breakTimeLeft;

                if (breakTimeLeft <= 0) {
                    clearInterval(breakTimerInterval);
                    endBreak();
                }
            }, 1000);
        }

        function skipBreak() {
            clearInterval(breakTimerInterval);
            endBreak();
        }

        function endBreak() {
            // Hide break screen, show exam screen
            document.getElementById('breakScreen').classList.add('hidden');
            document.getElementById('examScreen').classList.remove('hidden');

            // Continue with next question
            showExamQuestion();
        }

        function submitExamAnswer() {
            const input = document.getElementById('examAnswerInput');
            const userAnswer = input.value.trim();

            if (!userAnswer) {
                alert('Пожалуйста, введите ответ');
                return;
            }

            // Disable input to prevent multiple submissions
            input.disabled = true;

            handleExamAnswer(userAnswer);
        }

        function handleExamAnswer(selectedAnswer) {
            clearInterval(examTimerInterval);

            const question = examQuestions[examCurrentIndex];

            // Normalize answers for comparison (lowercase, trim)
            const normalizedUserAnswer = (selectedAnswer || '').toLowerCase().trim();
            const normalizedCorrectAnswer = question.correctAnswer.toLowerCase().trim();

            // Check if answer is correct
            const isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;

            // Store answer with appropriate question text
            const questionText = question.type === 'grammar' ? question.sentence : question.spanish;

            examAnswers.push({
                question: questionText,
                correctAnswer: question.correctAnswer,
                selectedAnswer: selectedAnswer || 'Нет ответа',
                isCorrect: isCorrect,
                category: question.category || question.cluster,
                type: question.type
            });

            if (isCorrect) {
                examScore++;
            }

            // Move to next question
            examCurrentIndex++;
            setTimeout(() => showExamQuestion(), 500);
        }

        function showExamResults() {
            clearInterval(examTimerInterval);

            const examTime = Math.floor((Date.now() - examStartTime) / 1000);
            const minutes = Math.floor(examTime / 60);
            const seconds = examTime % 60;
            const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Use actual number of answered questions
            const totalQuestions = examAnswers.length;
            const percentage = Math.round((examScore / totalQuestions) * 100);

            // Show results screen
            hideAllScreens();
            document.getElementById('examResultsScreen').classList.remove('hidden');

            // Update results
            document.getElementById('examScorePercent').textContent = percentage + '%';
            document.getElementById('examCorrect').textContent = examScore;
            document.getElementById('examTotal').textContent = totalQuestions;
            document.getElementById('examTimeSpent').textContent = timeString;

            // Set grade
            const gradeElement = document.getElementById('examGrade');
            if (percentage >= 90) {
                gradeElement.textContent = '🏆 Отлично!';
                gradeElement.style.color = '#4CAF50';
            } else if (percentage >= 75) {
                gradeElement.textContent = '👍 Хорошо!';
                gradeElement.style.color = '#8BC34A';
            } else if (percentage >= 60) {
                gradeElement.textContent = '📝 Удовлетворительно';
                gradeElement.style.color = '#FFC107';
            } else {
                gradeElement.textContent = '📚 Нужно подучить';
                gradeElement.style.color = '#FF5722';
            }

            // Reset to first page
            resultsCurrentPage = 0;
            renderResultsPage();
        }

        function renderResultsPage() {
            const detailedResults = document.getElementById('examDetailedResults');
            detailedResults.innerHTML = '<h3>Детальные результаты:</h3>';

            const totalPages = Math.ceil(examAnswers.length / RESULTS_PER_PAGE);
            const startIdx = resultsCurrentPage * RESULTS_PER_PAGE;
            const endIdx = Math.min(startIdx + RESULTS_PER_PAGE, examAnswers.length);
            const pageAnswers = examAnswers.slice(startIdx, endIdx);

            pageAnswers.forEach((answer, pageIndex) => {
                const index = startIdx + pageIndex;
                const resultDiv = document.createElement('div');
                resultDiv.style.cssText = 'margin: 10px 0; padding: 15px; border-radius: 8px; background: #f5f5f5;';

                const icon = answer.isCorrect ? '✅' : '❌';
                const color = answer.isCorrect ? '#4CAF50' : '#FF5722';

                // Используем CATEGORY_CONFIG для названия категории
                const categoryName = CATEGORY_CONFIG[answer.category]?.ru || answer.category;

                resultDiv.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.5em;">${icon}</span>
                        <div style="flex: 1;">
                            <strong>${index + 1}. ${answer.question}</strong> <span style="color: #999; font-size: 0.9em;">(${categoryName})</span><br>
                            <span style="color: ${color};">
                                Ваш ответ: ${answer.selectedAnswer}
                            </span><br>
                            ${!answer.isCorrect ? `<span style="color: #4CAF50;">Правильный ответ: ${answer.correctAnswer}</span>` : ''}
                        </div>
                    </div>
                `;

                detailedResults.appendChild(resultDiv);
            });

            // Add pagination controls
            if (totalPages > 1) {
                const paginationDiv = document.createElement('div');
                paginationDiv.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 20px; margin-top: 20px;';

                const prevButton = document.createElement('button');
                prevButton.className = 'btn btn-primary';
                prevButton.textContent = '← Назад';
                prevButton.disabled = resultsCurrentPage === 0;
                prevButton.onclick = () => {
                    if (resultsCurrentPage > 0) {
                        resultsCurrentPage--;
                        renderResultsPage();
                    }
                };

                const pageInfo = document.createElement('span');
                pageInfo.textContent = `Страница ${resultsCurrentPage + 1} из ${totalPages}`;
                pageInfo.style.fontSize = '1.1em';

                const nextButton = document.createElement('button');
                nextButton.className = 'btn btn-primary';
                nextButton.textContent = 'Вперед →';
                nextButton.disabled = resultsCurrentPage >= totalPages - 1;
                nextButton.onclick = () => {
                    if (resultsCurrentPage < totalPages - 1) {
                        resultsCurrentPage++;
                        renderResultsPage();
                    }
                };

                paginationDiv.appendChild(prevButton);
                paginationDiv.appendChild(pageInfo);
                paginationDiv.appendChild(nextButton);
                detailedResults.appendChild(paginationDiv);
            }
        }

        function confirmExitExam() {
            if (confirm('Вы уверены, что хотите выйти из экзамена? Прогресс будет потерян.')) {
                clearInterval(examTimerInterval);
                showMainMenu();
            }
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

        function unlockExam() {
            const profile = getActiveProfile();
            if (!profile) {
                alert('Нет активного профиля');
                return;
            }

            ensureProgressSkeleton(profile);

            // Динамическая установка 80% прогресса для всех unidades
            UNIDADES.forEach(unidad => {
                // Установка 80% для всех групп (динамически)
                const unidadData = vocabularyData[unidad];
                if (unidadData && unidadData.groups) {
                    Object.keys(unidadData.groups).forEach(groupName => {
                        profile.progress[unidad][groupName] = {
                            easy10: 80, easy25: 80,
                            medium10: 80, medium25: 80,
                            hard10: 80, hard25: 80
                        };
                    });
                }

                // Fill exercises progress if exists
                if (unidadData && unidadData.ejercicios) {
                    unidadData.ejercicios.forEach(exercise => {
                        profile.progress[unidad].ejercicios[exercise.id] = 80;
                    });
                }
            });

            const state = loadAppState();
            state.profiles[profile.id] = profile;
            saveAppState(state);

            updateUnidadUI();
            document.getElementById('qaOutput').textContent = '✅ Экзамен разблокирован! (Прогресс всех unidades установлен на 80%)';
        }

        function viewLocalStorage() {
            const state = loadAppState();
            document.getElementById('qaOutput').textContent = JSON.stringify(state, null, 2);
        }
async function saveNavigationState(screenId) {
    if (!ENABLE_BACKEND_SYNC) return; // Пропускаем, если бэкенд отключён

    const token = getToken();
    if (!token) return;

    try {
        await fetch(API_URL + '/navigation-state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                screen_id: screenId,
                current_unidad: currentUnidad,
                current_category: currentCategory
            })
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
        const navState = await getNavigationState();
        
        if (navState && navState.screen_id) {
            // Восстанавливаем переменные
            currentUnidad = navState.current_unidad;
            currentCategory = navState.current_category;
            
            // Показываем экран
            hideAllScreens();
            const el = document.getElementById(navState.screen_id);
            if (el) {
                el.classList.remove('hidden');
				if (['mainMenu', 'unidadMenu', 'categoryMenu'].includes(navState.screen_id)){
					showUserBadge();
				}
                if (navState.screen_id === 'mainMenu') updateUnidadUI();
                if (navState.screen_id === 'unidadMenu') {
                    renderCategoryCards();
                    updateUnidadProgressBars();
                }
                if (navState.screen_id === 'categoryMenu') updateCategoryButtons();
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
const ENABLE_BACKEND_SYNC = false; // Отключить синхронизацию с бэкендом

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
        'mainMenu', 'unidadMenu', 'categoryMenu',
        'questionScreen', 'resultsScreen', 'verbMenu',
        'verbPracticeScreen', 'qaScreen',
        'gramaticaMenu', 'gramaticaQuestionScreen', 'gramaticaResultsScreen',
        'grammarListScreen', 'grammarDetailScreen', 'grammarInteractiveScreen',
        'examScreen', 'examResultsScreen'
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
async function showGramaticaMenu() {
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
    gramCurrentPage = 0;

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
        card.onclick = () => startGramExercise(exercise);

        let progressColor = '#3498db';
        if (isPassed) progressColor = '#27ae60';
        else if (score > 0) progressColor = '#f39c12';

        card.innerHTML = `
            <div class="category-header">
                <span class="category-title">${isPassed ? '✅' : '📝'} ${exercise.title}</span>
                <span class="category-icon">${score}%</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${score}%; background: ${progressColor};"></div>
            </div>
            <p class="progress-text" style="font-size: 0.85em; color: ${isPassed ? '#27ae60' : '#7f8c8d'};">
                ${isPassed ? 'Пройдено!' : score > 0 ? 'Требуется 80% для прохождения' : '15 вопросов • Нажмите для начала'}
            </p>
        `;

        container.appendChild(card);
    });
}

// Pagination functions
function updateGramaticaPagination() {
    const totalPages = Math.ceil(gramaticaExercises.length / GRAM_EXERCISES_PER_PAGE);
    const pageIndicator = document.getElementById('gramPageIndicator');
    const prevBtn = document.getElementById('gramPrevBtn');
    const nextBtn = document.getElementById('gramNextBtn');

    pageIndicator.textContent = `Страница ${gramCurrentPage + 1} / ${totalPages}`;
    prevBtn.classList.toggle('hidden', gramCurrentPage === 0);
    nextBtn.disabled = gramCurrentPage >= totalPages - 1;
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

// Start a grammar exercise
function startGramExercise(exercise) {
    gramCurrentExercise = exercise;
    gramCurrentQuestions = shuffleArray([...exercise.questions]);
    gramCurrentQuestionIndex = 0;
    gramScore = 0;
    __gramIsAwaitingNext = false;

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
    gramTimeLeft = TIMER_DURATION;
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

    const percentage = (gramTimeLeft / TIMER_DURATION) * 100;
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

// Show Grammar List with Pagination
function showGrammarList() {
    // Save current screen for back navigation
    const allScreens = ['mainMenu', 'unidadMenu', 'categoryMenu', 'gramaticaMenu', 'verbMenu', 
                        'questionScreen', 'resultsScreen', 'gramaticaQuestionScreen', 
                        'gramaticaResultsScreen', 'verbPracticeScreen', 'qaScreen'];
    
    for (const screenId of allScreens) {
        const screen = document.getElementById(screenId);
        if (screen && !screen.classList.contains('hidden')) {
            grammarPreviousScreen = screenId;
            break;
        }
    }
    
    hideAllScreens();
    document.getElementById('grammarListScreen').classList.remove('hidden');
    grammarCurrentPage = 1;
    renderGrammarList();
}

// Render Grammar List
function renderGrammarList() {
    const container = document.getElementById('grammarRulesContainer');
    const startIndex = (grammarCurrentPage - 1) * GRAMMAR_RULES_PER_PAGE;
    const endIndex = startIndex + GRAMMAR_RULES_PER_PAGE;
    const rulesPage = grammarData.slice(startIndex, endIndex);
    
    container.innerHTML = '';
    
    if (rulesPage.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #7f8c8d;">Нет доступных правил</p>';
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
            <p style="margin: 10px 0 0 0; color: #7f8c8d; font-size: 0.9em;">${rule.topic}</p>
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

    // Go back to grammar list
    showGrammarList();
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

// Initialize Grammar Data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadGrammarData();
});
