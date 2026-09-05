# Testni profili priporočilnega sistema

Scenariji uporabljajo točna besedila odgovorov iz vprašalnika. Avtomatizirani
testi so v `src/app/study-advisor.spec.ts` in jih zažene ukaz `npm test`.
Pričakovanja uporabljajo razpon uvrstitve, ker se lahko natančen vrstni red ob
osvežitvi podatkov NAKVIS nekoliko spremeni.

## Računalništvo

1. Razviti aplikacijo ali pametno napravo
2. Matematika, fizika ali računalništvo
3. S podatki in sistemi
4. Nekaj, kar dejansko deluje
5. Zelo mi ustreza
6. S praktičnim preizkušanjem
7. Računalnik, razvojna ekipa ali tehnološko podjetje
8. Razvijati nove tehnologije in rešitve

Pričakovanje: program »Računalništvo in informatika« ali »Računalništvo in
informacijske tehnologije« je med prvimi petimi, najmanj osem od dvanajstih
rezultatov pa spada v področje računalništva in tehnike.

## Pravo

1. Razumeti, zakaj se ljudje in družba vedejo tako, kot se
2. Ekonomija, sociologija ali pravo
3. Z besedami in vsebinami
4. Jasna razlaga zahtevnega problema
5. Raje bi je imel manj
6. S pogovorom in sodelovanjem
7. Podjetje, ustanova ali projektna ekipa
8. Bolje razumeti svet, naravo ali družbo

Pričakovanje: program »Pravo« je med prvimi desetimi, najmanj osem rezultatov
pa spada v področje družbe in prava.

## Medicina

1. Pomagati človeku pri zdravstveni težavi
2. Biologija ali kemija
3. Z ljudmi
4. Pozitiven vpliv na človeka
5. V redu je, če ima jasen namen
6. Z mešanico teorije in prakse
7. Šola, klinika ali svetovalno okolje
8. Pomagati ljudem pri zdravju ali razvoju

Pričakovanje: program »Medicina« ali »Splošna medicina« je med prvimi desetimi,
najmanj osem rezultatov pa spada v zdravstvo in medicino.

## Arhitektura

1. Ustvariti vizualno, glasbeno ali filmsko delo
2. Matematika, fizika ali računalništvo
3. Z idejami in raziskovalnimi vprašanji
4. Nekaj, kar dejansko deluje
5. V redu je, če ima jasen namen
6. Z mešanico teorije in prakse
7. Studio, oder ali ustvarjalna delavnica
8. Razvijati nove tehnologije in rešitve

Pričakovanje: program »Arhitektura« je med prvimi tremi, najmanj pet rezultatov
pa spada v umetnost in oblikovanje. Ta profil namerno združuje ustvarjalnost,
tehnično razmišljanje ter praktični rezultat.

## Ekonomija

1. Organizirati projekt ali podjetje
2. Ekonomija, sociologija ali pravo
3. S podatki in sistemi
4. Uspešno izveden načrt
5. V redu je, če ima jasen namen
6. Z mešanico teorije in prakse
7. Podjetje, ustanova ali projektna ekipa
8. Voditi projekte in ustvarjati priložnosti

Pričakovanje: ekonomski ali poslovni program je med prvimi petimi, najmanj osem
rezultatov pa spada v poslovanje in ekonomijo.

## Glasba

1. Ustvariti vizualno, glasbeno ali filmsko delo
2. Likovna, glasbena ali druga umetnost
3. Z ljudmi
4. Izvirna ideja ali izraz
5. Raje bi je imel manj
6. S praktičnim preizkušanjem
7. Studio, oder ali ustvarjalna delavnica
8. Povezovati ljudi, jezike in ideje

Pričakovanje: program »Glasbena umetnost« je med prvimi tremi, najmanj osem
rezultatov pa spada v umetnost in oblikovanje. Profil združuje umetniško
izražanje, praktično vajo, delo z ljudmi in nastopanje.

## Šport in kineziologija

1. Pomagati človeku pri zdravstveni težavi
2. Šport ali praktični pouk
3. Z naravo ali živimi sistemi
4. Nekaj, kar dejansko deluje
5. V redu je, če ima jasen namen
6. S praktičnim preizkušanjem
7. Šola, klinika ali svetovalno okolje
8. Pomagati ljudem pri zdravju ali razvoju

Pričakovanje: »Kineziologija« ali »Športno treniranje« je med prvimi tremi,
najmanj pet rezultatov spada v šport in gibanje, med prvimi tremi pa se pojavi
tudi program Fakultete za šport. Profil poudarja gibanje, praktično delo,
človeško telo ter pozitiven vpliv na zdravje in razvoj.

## Jeziki in prevajanje

1. Ustvariti vizualno, glasbeno ali filmsko delo
2. Jeziki, zgodovina ali filozofija
3. Z besedami in vsebinami
4. Jasna razlaga zahtevnega problema
5. Raje bi je imel manj
6. S poglobljenim razumevanjem teorije
7. Šola, klinika ali svetovalno okolje
8. Povezovati ljudi, jezike in ideje

Pričakovanje: »Angleški jezik in književnost«, »Anglistika« ali »Prevajalstvo«
je med prvimi petimi, najmanj osem rezultatov pa spada v jezike in humanistiko.

## Kaj testi preverjajo

Za vsak profil test preveri ciljni program, prevladujoče področje in prisotnost
konkretnih ujemajočih predmetov. Dodan je tudi ločen sintetični primer, ki
preveri, da manjša tipkarska napaka v imenu predmeta še vedno sproži fuzzy
ujemanje.
