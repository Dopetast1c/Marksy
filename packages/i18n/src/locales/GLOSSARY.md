# Glossary: one concept, one word

The words each language uses for Marksy's concepts (docs/i18n.md). A translation keeps to them; a reviewer who changes
one changes it everywhere in the file and here. The ten machine translations (M5e) were made from `en.json`, with
`ru.json` as the reference for intent.

| Concept | en | ru | be | uk | kk | pl | de | es | pt | fr | nl | ro |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| diary (the school's system the app reads) | diary | дневник | дзённік | щоденник | күнделік | dziennik | Klassenbuch | agenda escolar | caderneta | carnet numérique | schoolportaal | catalog |
| mark | mark | оценка | адзнака | оцінка | баға | ocena | Note | nota | nota | note | cijfer | notă |
| final mark | final mark | итоговая отметка | выніковая адзнака | підсумкова оцінка | қорытынды баға | ocena końcowa | Endnote | nota final | nota final | note finale | eindcijfer | notă finală |
| average | average | средний балл | сярэдні бал | середній бал | орташа баға | średnia | Durchschnitt | media | média | moyenne | gemiddelde | medie |
| Attention (screen) | Attention | Внимание | Увага | Увага | Назар | Ważne | Wichtig | Atención | Atenção | Points d’attention | Aandacht | Atenție |
| tag | tag | тег | тэг | тег | тег | tag | Label | etiqueta | etiqueta | étiquette | label | etichetă |
| ready (prepared for a lesson) | ready | готово | гатова | готово | дайын | gotowe | fertig | listo | feito | fait | klaar | gata |
| lesson won’t take place | Lesson won’t take place | Урока не будет | Урока не будзе | Уроку не буде | Сабақ болмайды | Lekcji nie będzie | Stunde fällt aus | No habrá clase | Não haverá aula | Le cours n’aura pas lieu | Les gaat niet door | Lecția nu va avea loc |
| quarter | Quarter | Четверть | Чвэрць | Чверть | Тоқсан | Kwartał | Quartal | Bimestre | Bimestre | Période | Kwartaal | Modul |
| trimester | Trimester | Триместр | Трыместр | Триместр | Триместр | Trymestr | Trimester | Trimestre | Trimestre | Trimestre | Trimester | Trimestru |
| semester | Semester | Семестр | Семестр | Семестр | Семестр | Semestr | Halbjahr | Semestre | Semestre | Semestre | Semester | Semestru |
| term (any other kind) | Term | Период | Перыяд | Період | Оқу кезеңі | Okres | Abschnitt | Periodo | Período | Étape | Periode | Perioadă |
| bells (lesson times) | bells | звонки | званкі | дзвінки | қоңыраулар | dzwonki | Klingelzeiten | timbres | toques | horaires | lestijden | programul lecțiilor |
| sync | Sync | Синхронизация | Сінхранізацыя | Синхронізація | Синхрондау | Synchronizacja | Abgleich | Sincronización | Sincronização | Synchronisation | Synchronisatie | Sincronizare |
| family | Family | Семья | Сям’я | Сім’я | Отбасы | Rodzina | Familie | Familia | Família | Famille | Gezin | Familie |
| parent (role) | parent | родитель | бацькі | батьки | ата-ана | rodzic | Elternteil | madre o padre | responsável | parent | ouder | părinte |
| student (role) | student | ученик | вучань | учень | оқушы | uczeń | Schulkind | estudiante | estudante | élève | leerling | elev |
| simple mode | Simple mode | Простой режим | Просты рэжым | Простий режим | Қарапайым режим | Tryb prosty | Einfacher Modus | Modo sencillo | Modo simples | Mode simple | Eenvoudige modus | Mod simplu |
| Appearance | Appearance | Оформление | Афармленне | Оформлення | Сыртқы түрі | Wygląd | Aussehen | Apariencia | Aspeto | Apparence | Weergave | Aspect |
| bands: low / average / good / excellent | low / average / good / excellent | низкие / средние / хорошие / отличные | нізкія / сярэднія / добрыя / выдатныя | низькі / середні / добрі / відмінні | төмен / орташа / жақсы / үздік | niskie / przeciętne / dobre / bardzo dobre | niedrig / mittel / gut / sehr gut | bajas / intermedias / buenas / excelentes | baixas / suficientes / boas / excelentes | faibles / moyennes / bonnes / excellentes | laag / gemiddeld / goed / uitstekend | slabe / medii / bune / excelente |

## Choices a reviewer should know

- **No word for a school quarter.** Spanish and Portuguese use «bimestre», French «Période» (the blocks between
  holidays), Romanian «Modul», because the word for a third of the year is taken by the trimester kind. «Période»
  is also French for the generic period, and «Período» Portuguese for the other term kind.
- **Gender.** Where a language has no neutral singular for a role, the translation uses a plural or a pair: Belarusian
  «бацькі», Ukrainian «батьки», Spanish «madre o padre».
- **Open for a native speaker (be):** the role «родитель» is «бацькі», a plural, which reads oddly next to one
  person's name («Мама (бацькі)»). Would the pair «бацька або маці», like the Spanish «madre o padre», read better
  for the role label and «у ролі …»? Verbs about teachers and children are passive or impersonal
  («оцінку змінено», «zmieniona przez nauczyciela»), labels are nouns («fait», «feito», «listo» as a state).
- **German nouns keep their capital** inside a sentence (`capitalNouns` in `languages.ts`, `inSentence()`): a term
  word or a tag name is not lower-cased there. German calls tags «Label», because «Tag» means day.
- **Kazakh endings** never attach to a placeholder: the case goes on a neighbouring noun («сағ. {{at}}»,
  «{{value}} балдан төмен»).
- **French typography**: a no-break space before `: ; ? !` and inside « ».
- **Romanian** uses the comma-below letters ș ț.
- The fonts' names and «Honors» (a course level) stay as they are.
