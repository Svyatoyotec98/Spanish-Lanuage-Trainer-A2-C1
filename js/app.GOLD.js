        // ═══════════════════════════════════════════════════════════════
        // PROFILE SYSTEM & PERSISTENCE ENGINE V4
        // ═══════════════════════════════════════════════════════════════

        const DEBUG = false;
        const STORAGE_KEY = 'svt_profiles_v1';

        // ═══════════════════════════════════════════════════════════════
        // HELPER FUNCTIONS - State Management
        // ═══════════════════════════════════════════════════════════════

        function loadAppState() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
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
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                if (DEBUG) console.log('State saved:', state);
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
                progress: {
                    unidad_1: {
                        sustantivos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 },
                        adjetivos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 },
                        verbos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 }
                    },
                    unidad_3: {
                        sustantivos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 },
                        adjetivos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 },
                        verbos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 }
                    },
                    unidad_4: {
                        sustantivos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 },
                        adjetivos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 },
                        verbos: { easy10: 0, easy25: 0, medium10: 0, medium25: 0, hard10: 0, hard25: 0 }
                    }
                },
                unlocks: {
                    unidad_3: false,
                    unidad_4: false
                }
            };

            state.profiles[profileId] = newProfile;
            state.activeProfileId = profileId;
            saveAppState(state);
            
            if (DEBUG) console.log('Profile created:', newProfile);
            return profileId;
        }

        function ensureProgressSkeleton(profile) {
            if (!profile.progress) profile.progress = {};
            if (!profile.unlocks) profile.unlocks = { unidad_3: false, unidad_4: false };

            ['unidad_1', 'unidad_3', 'unidad_4'].forEach(unidad => {
                if (!profile.progress[unidad]) profile.progress[unidad] = {};
                ['sustantivos', 'adjetivos', 'verbos'].forEach(category => {
                    if (!profile.progress[unidad][category]) {
                        profile.progress[unidad][category] = {
                            easy10: 0, easy25: 0,
                            medium10: 0, medium25: 0,
                            hard10: 0, hard25: 0
                        };
                    }
                });
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

        function calculateCategoryProgress(unidad, category) {
            const profile = getActiveProfile();
            if (!profile) return 0;

            ensureProgressSkeleton(profile);
            
            const categoryData = profile.progress[unidad][category];
            const scores = Object.values(categoryData);
            const sum = scores.reduce((a, b) => a + b, 0);
            const avg = sum / scores.length;
            return Math.round(avg);
        }

        function calculateUnidadProgress(unidad) {
            const profile = getActiveProfile();
            if (!profile) return 0;

            ensureProgressSkeleton(profile);
            
            const categories = ['sustantivos', 'adjetivos', 'verbos'];
            let totalProgress = 0;
            
            categories.forEach(cat => {
                totalProgress += calculateCategoryProgress(unidad, cat);
            });

            return Math.round(totalProgress / categories.length);
        }

        function updateUnlocks() {
            const profile = getActiveProfile();
            if (!profile) return;

            const unidad1Progress = calculateUnidadProgress('unidad_1');
            const unidad3Progress = calculateUnidadProgress('unidad_3');

            if (unidad1Progress >= 80) {
                profile.unlocks.unidad_3 = true;
            }

            if (unidad3Progress >= 80) {
                profile.unlocks.unidad_4 = true;
            }

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
             'resultsScreen', 'verbMenu', 'verbPracticeScreen', 'qaScreen'].forEach(id => {
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
            hideAll();
            hideUserBadge();
            document.getElementById('profileSelectScreen').classList.remove('hidden');
            renderProfileList();
        }

        function showProfileCreate() {
            hideAll();
            hideUserBadge();
            document.getElementById('profileCreateScreen').classList.remove('hidden');
            document.getElementById('nicknameInput').value = '';
            document.getElementById('nicknameError').classList.add('hidden');
            document.getElementById('nicknameInput').focus();
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
                const card = document.createElement('div');
                card.className = 'profile-card' + (isActive ? ' active' : '');
                card.onclick = () => selectProfile(profile.id);

                const totalProgress = Math.round(
                    (calculateUnidadProgress('unidad_1') + 
                     calculateUnidadProgress('unidad_3') + 
                     calculateUnidadProgress('unidad_4')) / 3
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

        function showMainMenu() {
            hideAll();
            showUserBadge();
            document.getElementById('mainMenu').classList.remove('hidden');
            updateUnidadUI();
        }

        function updateUnidadUI() {
            const profile = getActiveProfile();
            if (!profile) return;

            ensureProgressSkeleton(profile);

            // Update Unidad 1
            const unidad1Progress = calculateUnidadProgress('unidad_1');
            document.getElementById('unidad-1-progress-bar').style.width = unidad1Progress + '%';
            document.getElementById('unidad-1-progress-text').textContent = unidad1Progress + '%';

            // Update Unidad 3
            const unidad3Btn = document.getElementById('unidad-3-btn');
            if (profile.unlocks.unidad_3) {
                unidad3Btn.classList.remove('locked');
                unidad3Btn.querySelector('.category-icon').textContent = '🔓';
                const unidad3Progress = calculateUnidadProgress('unidad_3');
                document.getElementById('unidad-3-progress-bar').style.width = unidad3Progress + '%';
                document.getElementById('unidad-3-progress-text').textContent = unidad3Progress + '%';
            } else {
                unidad3Btn.classList.add('locked');
                unidad3Btn.querySelector('.category-icon').textContent = '🔒';
                document.getElementById('unidad-3-progress-text').textContent = 'Заблокировано - Завершите Unidad 1 (80%)';
            }

            // Update Unidad 4
            const unidad4Btn = document.getElementById('unidad-4-btn');
            if (profile.unlocks.unidad_4) {
                unidad4Btn.classList.remove('locked');
                unidad4Btn.querySelector('.category-icon').textContent = '🔓';
                const unidad4Progress = calculateUnidadProgress('unidad_4');
                document.getElementById('unidad-4-progress-bar').style.width = unidad4Progress + '%';
                document.getElementById('unidad-4-progress-text').textContent = unidad4Progress + '%';
            } else {
                unidad4Btn.classList.add('locked');
                unidad4Btn.querySelector('.category-icon').textContent = '🔒';
                document.getElementById('unidad-4-progress-text').textContent = 'Заблокировано - Завершите Unidad 3 (80%)';
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

        const vocabularyData = {
            unidad_1: {
                sustantivos: [
                    { spanish: "el libro", ru: "книга", sentence: "Leo ___ todos los días" },
                    { spanish: "la casa", ru: "дом", sentence: "Mi ___ es grande" },
                    { spanish: "el agua", ru: "вода", sentence: "Bebo ___ fresca" },
                    { spanish: "la mesa", ru: "стол", sentence: "La comida está en ___" },
                    { spanish: "el perro", ru: "собака", sentence: "Mi ___ es amigable" },
                    { spanish: "la ventana", ru: "окно", sentence: "Abro ___ por la mañana" },
                    { spanish: "el pan", ru: "хлеб", sentence: "Compro ___ en la panadería" },
                    { spanish: "la puerta", ru: "дверь", sentence: "Cierra ___ por favor" },
                    { spanish: "el tiempo", ru: "время/погода", sentence: "No tengo ___ hoy" },
                    { spanish: "la ciudad", ru: "город", sentence: "Vivo en ___ grande" },
                    { spanish: "el coche", ru: "машина", sentence: "Mi ___ es rojo" },
                    { spanish: "la comida", ru: "еда", sentence: "___ está deliciosa" },
                    { spanish: "el trabajo", ru: "работа", sentence: "Voy al ___ mañana" },
                    { spanish: "la familia", ru: "семья", sentence: "Mi ___ es importante" },
                    { spanish: "el café", ru: "кофе", sentence: "Tomo ___ cada mañana" },
                    { spanish: "la escuela", ru: "школа", sentence: "Los niños van a ___" },
                    { spanish: "el dinero", ru: "деньги", sentence: "Necesito más ___" },
                    { spanish: "la música", ru: "музыка", sentence: "Me gusta ___ clásica" },
                    { spanish: "el amigo", ru: "друг", sentence: "Mi ___ se llama Juan" },
                    { spanish: "la noche", ru: "ночь", sentence: "Duermo por ___" },
                    { spanish: "el día", ru: "день", sentence: "Hoy es un buen ___" },
                    { spanish: "la mano", ru: "рука", sentence: "Escribo con mi ___" },
                    { spanish: "el mundo", ru: "мир", sentence: "Quiero viajar por el ___" },
                    { spanish: "la vida", ru: "жизнь", sentence: "___ es bella" },
                    { spanish: "el hijo", ru: "сын", sentence: "Mi ___ tiene 5 años" }
                ],
                adjetivos: [
                    { spanish: "grande", ru: "большой", sentence: "La casa es ___" },
                    { spanish: "pequeño", ru: "маленький", sentence: "El perro es ___" },
                    { spanish: "bueno", ru: "хороший", sentence: "Es un libro ___" },
                    { spanish: "malo", ru: "плохой", sentence: "El tiempo es ___" },
                    { spanish: "nuevo", ru: "новый", sentence: "Tengo un coche ___" },
                    { spanish: "viejo", ru: "старый", sentence: "Esta casa es ___" },
                    { spanish: "bonito", ru: "красивый", sentence: "Ella es muy ___" },
                    { spanish: "feo", ru: "уродливый", sentence: "El edificio es ___" },
                    { spanish: "rápido", ru: "быстрый", sentence: "El tren es ___" },
                    { spanish: "lento", ru: "медленный", sentence: "El autobús es ___" },
                    { spanish: "alto", ru: "высокий", sentence: "Mi hermano es ___" },
                    { spanish: "bajo", ru: "низкий", sentence: "La mesa es ___" },
                    { spanish: "fácil", ru: "лёгкий", sentence: "El examen es ___" },
                    { spanish: "difícil", ru: "сложный", sentence: "La pregunta es ___" },
                    { spanish: "feliz", ru: "счастливый", sentence: "Estoy muy ___" },
                    { spanish: "triste", ru: "грустный", sentence: "Él está ___" },
                    { spanish: "caliente", ru: "горячий", sentence: "El café está ___" },
                    { spanish: "frío", ru: "холодный", sentence: "El agua está ___" },
                    { spanish: "limpio", ru: "чистый", sentence: "La casa está ___" },
                    { spanish: "sucio", ru: "грязный", sentence: "El coche está ___" },
                    { spanish: "rico", ru: "богатый/вкусный", sentence: "El hombre es ___" },
                    { spanish: "pobre", ru: "бедный", sentence: "La familia es ___" },
                    { spanish: "joven", ru: "молодой", sentence: "Mi hermana es ___" },
                    { spanish: "importante", ru: "важный", sentence: "Este tema es ___" },
                    { spanish: "interesante", ru: "интересный", sentence: "El libro es ___" }
                ],
                verbos: [
                    { spanish: "hablar", ru: "говорить", sentence: "Yo ___ español" },
                    { spanish: "comer", ru: "есть", sentence: "Ellos ___ pan" },
                    { spanish: "vivir", ru: "жить", sentence: "Nosotros ___ aquí" },
                    { spanish: "ser", ru: "быть", sentence: "Yo ___ estudiante" },
                    { spanish: "estar", ru: "быть/находиться", sentence: "Tú ___ cansado" },
                    { spanish: "tener", ru: "иметь", sentence: "Ella ___ un gato" },
                    { spanish: "hacer", ru: "делать", sentence: "Yo ___ la tarea" },
                    { spanish: "ir", ru: "идти", sentence: "Nosotros ___ al cine" },
                    { spanish: "ver", ru: "видеть", sentence: "Ellos ___ la televisión" },
                    { spanish: "dar", ru: "давать", sentence: "Yo te ___ un regalo" },
                    { spanish: "saber", ru: "знать", sentence: "Tú ___ la respuesta" },
                    { spanish: "poder", ru: "мочь", sentence: "Ella ___ bailar" },
                    { spanish: "querer", ru: "хотеть", sentence: "Yo ___ agua" },
                    { spanish: "decir", ru: "сказать", sentence: "Él ___ la verdad" },
                    { spanish: "venir", ru: "приходить", sentence: "Ellos ___ mañana" },
                    { spanish: "trabajar", ru: "работать", sentence: "Yo ___ aquí" },
                    { spanish: "estudiar", ru: "учить", sentence: "Nosotros ___ español" },
                    { spanish: "aprender", ru: "учиться", sentence: "Tú ___ rápido" },
                    { spanish: "escribir", ru: "писать", sentence: "Ella ___ un libro" },
                    { spanish: "leer", ru: "читать", sentence: "Yo ___ el periódico" },
                    { spanish: "beber", ru: "пить", sentence: "Ellos ___ café" },
                    { spanish: "abrir", ru: "открывать", sentence: "Yo ___ la puerta" },
                    { spanish: "cerrar", ru: "закрывать", sentence: "Tú ___ la ventana" },
                    { spanish: "comprar", ru: "покупать", sentence: "Nosotros ___ comida" },
                    { spanish: "vender", ru: "продавать", sentence: "Ella ___ coches" }
                ]
            },
            unidad_3: {
                sustantivos: [
                    { spanish: "el ordenador", ru: "компьютер", sentence: "Trabajo con el ___" },
                    { spanish: "la medicina", ru: "лекарство", sentence: "Tomo ___ cuando estoy enfermo" },
                    { spanish: "el hospital", ru: "больница", sentence: "Voy al ___ para visitar" },
                    { spanish: "la tienda", ru: "магазин", sentence: "Compro en ___" },
                    { spanish: "el mercado", ru: "рынок", sentence: "Hay frutas en el ___" },
                    { spanish: "la playa", ru: "пляж", sentence: "Me gusta ___ en verano" },
                    { spanish: "el río", ru: "река", sentence: "Nado en el ___" },
                    { spanish: "la montaña", ru: "гора", sentence: "Subo ___ alta" },
                    { spanish: "el bosque", ru: "лес", sentence: "Camino por el ___" },
                    { spanish: "la isla", ru: "остров", sentence: "Visito ___ tropical" }
                ],
                adjetivos: [
                    { spanish: "moderno", ru: "современный", sentence: "El edificio es ___" },
                    { spanish: "antiguo", ru: "древний", sentence: "El castillo es ___" },
                    { spanish: "cómodo", ru: "удобный", sentence: "El sofá es ___" },
                    { spanish: "incómodo", ru: "неудобный", sentence: "La silla es ___" },
                    { spanish: "estrecho", ru: "узкий", sentence: "La calle es ___" },
                    { spanish: "ancho", ru: "широкий", sentence: "El río es ___" },
                    { spanish: "oscuro", ru: "тёмный", sentence: "El cuarto es ___" },
                    { spanish: "claro", ru: "светлый", sentence: "El día es ___" },
                    { spanish: "dulce", ru: "сладкий", sentence: "El pastel es ___" },
                    { spanish: "amargo", ru: "горький", sentence: "El café es ___" }
                ],
                verbos: [
                    { spanish: "conocer", ru: "знать/встречать", sentence: "Yo ___ Madrid" },
                    { spanish: "salir", ru: "выходить", sentence: "Nosotros ___ temprano" },
                    { spanish: "poner", ru: "класть", sentence: "Yo ___ la mesa" },
                    { spanish: "traer", ru: "приносить", sentence: "Ellos ___ comida" },
                    { spanish: "llevar", ru: "нести/носить", sentence: "Ella ___ un vestido" },
                    { spanish: "buscar", ru: "искать", sentence: "Yo ___ mis llaves" },
                    { spanish: "encontrar", ru: "находить", sentence: "Tú ___ la solución" },
                    { spanish: "perder", ru: "терять", sentence: "Nosotros ___ el partido" },
                    { spanish: "ganar", ru: "выигрывать/зарабатывать", sentence: "Ellos ___ dinero" },
                    { spanish: "empezar", ru: "начинать", sentence: "Yo ___ a trabajar" }
                ]
            },
            unidad_4: {
                sustantivos: [
                    { spanish: "el avión", ru: "самолёт", sentence: "Viajo en ___" },
                    { spanish: "el tren", ru: "поезд", sentence: "Tomo el ___ diario" },
                    { spanish: "el barco", ru: "корабль", sentence: "Navego en ___" },
                    { spanish: "la estación", ru: "станция", sentence: "Espero en ___" },
                    { spanish: "el aeropuerto", ru: "аэропорт", sentence: "Voy al ___" },
                    { spanish: "el hotel", ru: "отель", sentence: "Me alojo en el ___" },
                    { spanish: "el restaurante", ru: "ресторан", sentence: "Como en el ___" },
                    { spanish: "la oficina", ru: "офис", sentence: "Trabajo en ___" },
                    { spanish: "el banco", ru: "банк", sentence: "Voy al ___ a sacar dinero" },
                    { spanish: "la biblioteca", ru: "библиотека", sentence: "Estudio en ___" }
                ],
                adjetivos: [
                    { spanish: "caro", ru: "дорогой", sentence: "El reloj es ___" },
                    { spanish: "barato", ru: "дешёвый", sentence: "La camisa es ___" },
                    { spanish: "ligero", ru: "лёгкий", sentence: "La maleta es ___" },
                    { spanish: "pesado", ru: "тяжёлый", sentence: "El libro es ___" },
                    { spanish: "duro", ru: "твёрдый", sentence: "La cama es ___" },
                    { spanish: "blando", ru: "мягкий", sentence: "El cojín es ___" },
                    { spanish: "seco", ru: "сухой", sentence: "El clima es ___" },
                    { spanish: "mojado", ru: "мокрый", sentence: "El suelo está ___" },
                    { spanish: "lleno", ru: "полный", sentence: "El vaso está ___" },
                    { spanish: "vacío", ru: "пустой", sentence: "La botella está ___" }
                ],
                verbos: [
                    { spanish: "viajar", ru: "путешествовать", sentence: "Me gusta ___" },
                    { spanish: "visitar", ru: "посещать", sentence: "Quiero ___ España" },
                    { spanish: "volar", ru: "летать", sentence: "El avión va a ___" },
                    { spanish: "conducir", ru: "водить", sentence: "Yo ___ bien" },
                    { spanish: "cambiar", ru: "менять", sentence: "Necesito ___ dinero" },
                    { spanish: "pagar", ru: "платить", sentence: "Yo ___ la cuenta" },
                    { spanish: "reservar", ru: "бронировать", sentence: "Voy a ___ un hotel" },
                    { spanish: "confirmar", ru: "подтверждать", sentence: "Debo ___ el vuelo" },
                    { spanish: "cancelar", ru: "отменять", sentence: "Tengo que ___ la cita" },
                    { spanish: "esperar", ru: "ждать", sentence: "Yo ___ aquí" }
                ]
            }
        };

        // ═══════════════════════════════════════════════════════════════
        // UNIDAD & CATEGORY NAVIGATION
        // ═══════════════════════════════════════════════════════════════

        function showUnidadMenu(unidad) {
            const profile = getActiveProfile();
            if (!profile) return;

            if (unidad === 'unidad_3' && !profile.unlocks.unidad_3) {
                alert('Завершите Unidad 1 со средним прогрессом 80% для разблокировки Unidad 3');
                return;
            }

            if (unidad === 'unidad_4' && !profile.unlocks.unidad_4) {
                alert('Завершите Unidad 3 со средним прогрессом 80% для разблокировки Unidad 4');
                return;
            }

            currentUnidad = unidad;
            hideAll();
            showUserBadge();
            document.getElementById('unidadMenu').classList.remove('hidden');

            const titles = {
                unidad_1: 'Unidad 1',
                unidad_3: 'Unidad 3',
                unidad_4: 'Unidad 4'
            };
            document.getElementById('unidadTitle').textContent = titles[unidad];

            updateUnidadProgressBars();
        }

        function updateUnidadProgressBars() {
            const profile = getActiveProfile();
            if (!profile) return;

            // Average progress
            const categories = ['sustantivos', 'adjetivos', 'verbos'];
            let totalProgress = 0;
            categories.forEach(cat => {
                totalProgress += calculateCategoryProgress(currentUnidad, cat);
            });
            const avgProgress = Math.round(totalProgress / categories.length);

            // Update average progress (just text, no bar in v3 style)
            const avgText = document.getElementById('avg-progress-text');
            if (avgText) avgText.textContent = avgProgress;

            // Individual categories
            categories.forEach(cat => {
                const progress = calculateCategoryProgress(currentUnidad, cat);
                document.getElementById(`${cat}-progress-bar`).style.width = progress + '%';
                document.getElementById(`${cat}-progress-text`).textContent = progress + '%';
            });

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
        }

        function showCategoryMenu(category) {
            currentCategory = category;
            hideAll();
            showUserBadge();
            document.getElementById('categoryMenu').classList.remove('hidden');

            const titles = {
                sustantivos: '📦 Sustantivos (Nouns)',
                adjetivos: '🎨 Adjetivos (Adjectives)',
                verbos: '⚡ Verbos (Verbs)'
            };
            document.getElementById('categoryTitle').textContent = titles[category];

            updateCategoryButtons();
        }

        function updateCategoryButtons() {
            const profile = getActiveProfile();
            if (!profile) return;

            ensureProgressSkeleton(profile);

            const categoryData = profile.progress[currentUnidad][currentCategory];

            // Update category average progress (just text, no bar)
            const avgProgress = calculateCategoryProgress(currentUnidad, currentCategory);
            const avgText = document.getElementById('category-avg-progress-text');
            if (avgText) avgText.textContent = avgProgress;

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

        function startTest(level, count) {
            currentLevel = level;
            currentCount = count;
            currentQuestionIndex = 0;
            score = 0;

            const words = vocabularyData[currentUnidad][currentCategory];
            const shuffled = [...words].sort(() => Math.random() - 0.5);
            currentQuestions = shuffled.slice(0, count);

            hideAll();
            showUserBadge();
            document.getElementById('questionScreen').classList.remove('hidden');

            showQuestion();
        }

        function showQuestion() {
            if (currentQuestionIndex >= currentQuestions.length) {
                showResults();
                return;
            }

            const question = currentQuestions[currentQuestionIndex];
            document.getElementById('questionProgress').textContent = 
                `Вопрос ${currentQuestionIndex + 1} из ${currentQuestions.length}`;

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

            const words = vocabularyData[currentUnidad][currentCategory];
            
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
            if (isCorrect) {
                score++;
                showFeedback(true, 'Правильно!');
            } else {
                const question = currentQuestions[currentQuestionIndex];
                const correctText = currentLevel === 'easy' ? question.ru : question.spanish;
                showFeedback(false, `Неправильно. Правильный ответ: ${correctText}`);
            }

            setTimeout(() => {
                currentQuestionIndex++;
                showQuestion();
            }, 1500);
        }

        function submitManualAnswer() {
            const input = document.getElementById('manualInput');
            const answer = input.value.trim().toLowerCase();
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

            setTimeout(() => {
                currentQuestionIndex++;
                showQuestion();
            }, 1500);
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
                showCategoryMenu(currentCategory);
            }
        }

        function startExam() {
            alert('Режим экзамена скоро будет доступен!');
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

            profile.unlocks.unidad_3 = true;
            profile.unlocks.unidad_4 = true;

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
            
            ['unidad_1', 'unidad_3', 'unidad_4'].forEach(unidad => {
                ['sustantivos', 'adjetivos', 'verbos'].forEach(category => {
                    profile.progress[unidad][category] = {
                        easy10: 0, easy25: 0,
                        medium10: 0, medium25: 0,
                        hard10: 0, hard25: 0
                    };
                });
            });

            profile.unlocks = { unidad_3: false, unidad_4: false };

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

            ['unidad_1', 'unidad_3', 'unidad_4'].forEach(unidad => {
                ['sustantivos', 'adjetivos', 'verbos'].forEach(category => {
                    profile.progress[unidad][category] = {
                        easy10: 100, easy25: 100,
                        medium10: 100, medium25: 100,
                        hard10: 100, hard25: 100
                    };
                });
            });

            profile.unlocks = { unidad_3: true, unidad_4: true };

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

        // ═══════════════════════════════════════════════════════════════
        // INITIALIZATION
        // ═══════════════════════════════════════════════════════════════

        window.addEventListener('DOMContentLoaded', () => {
            // Load state to warm up data, but don't auto-navigate
            const state = loadAppState();
            
            // ALWAYS show Start Screen on page load
            // User must click "Начать" to proceed to profile selection
            showStart();

            console.log('✅ Spanish Vocabulary Trainer v4.0 (Профили) загружен');
            console.log('✅ Система профилей инициализирована');
        });
