require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const User = require('./models/User'); // Assure-toi que ce fichier existe dans le dossier models

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
app.use(cors());
app.use(express.json());

// 👇👇👇 COLLE TON LIEN MONGODB ENTIER ENTRE LES GUILLEMETS CI-DESSOUS 👇👇👇
const dbURI = "mongodb+srv://admin:abcd1234@cluster0.dlsfiac.mongodb.net/?appName=Cluster0"; 

console.log("⏳ Connexion en cours vers MongoDB Atlas...");

mongoose.connect(dbURI, {
    family: 4 // Force l'IPv4 pour éviter les erreurs de réseau
})
.then(() => console.log("✅ VICTOIRE ! Connecté à MongoDB !"))
.catch(err => console.error("❌ Erreur Connexion DB :", err));

// --- FONCTIONS UTILITAIRES ---

// Génère un code ami unique (Ex: SQ-4812)
function generateFriendCode() {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `SQ-${random}`;
}

// --- ROUTES ---

// 1. INSCRIPTION
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Vérifier si le joueur existe déjà
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ error: "Ce pseudo est déjà pris !" });

        // Crypter le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Générer un code ami
        const newFriendCode = generateFriendCode();

        // Créer le joueur
        const newUser = new User({
            username,
            password: hashedPassword,
            friendCode: newFriendCode,
            gameState: { score: 0, coins: 0, currentSkin: 'skin-default' }
        });

        await newUser.save();
        res.json({ success: true, message: "Compte créé avec succès !" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
    }
});

// 2. CONNEXION
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: "Joueur introuvable." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Mot de passe incorrect." });

        res.json({ 
            success: true, 
            message: "Connexion réussie !",
            userData: user 
        });
    } catch (err) {
        res.status(500).json({ error: "Erreur de connexion." });
    }
});

// 3. SAUVEGARDE (CLOUD SAVE)
app.post('/api/save', async (req, res) => {
    try {
        const { username, password, data } = req.body;

        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: "Joueur introuvable." });
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Mot de passe incorrect." });

        // Mise à jour des données
        if (data.score !== undefined) user.gameState.score = data.score;
        if (data.coins !== undefined) user.gameState.coins = data.coins;
        if (data.currentSkin) user.gameState.currentSkin = data.currentSkin;
        
        if (data.stats) user.stats = data.stats;
        if (data.inventory) {
            user.inventory.ownedSkins = data.inventory.ownedSkins;
            user.inventory.ownedUpgrades = data.inventory.ownedUpgrades;
        }
        if (data.settings) user.settings = data.settings;

        // Mise à jour de la date de dernière connexion
        user.lastLogin = Date.now();

        await user.save();
        res.json({ success: true, message: "Sauvegarde Cloud OK !" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la sauvegarde." });
    }
});

// 4. LEADERBOARD (CLASSEMENT)
app.get('/api/leaderboard', async (req, res) => {
    try {
        const topPlayers = await User.find()
            .sort({ "stats.highScore": -1 })
            .limit(10)
            .select("username stats.highScore gameState.currentSkin");

        res.json({ success: true, leaderboard: topPlayers });
    } catch (err) {
        res.status(500).json({ error: "Impossible de récupérer le classement." });
    }
});

// --- ROUTES AMIS ---

// 5. LISTE DES AMIS (Avec Auto-Réparation)
app.post('/api/friends/list', async (req, res) => {
    try {
        const { username } = req.body;
        
        // On récupère le joueur et ses amis
        const user = await User.findOne({ username }).populate('friends', 'username gameState stats lastLogin currentSkin friendCode');
        
        if (!user) return res.status(404).json({ error: "Joueur introuvable" });

        // AUTO-RÉPARATION : Si le joueur n'a pas de code (vieux compte), on en crée un !
        if (!user.friendCode) {
            user.friendCode = generateFriendCode();
            await user.save();
            console.log(`🔧 Code réparé pour ${username} : ${user.friendCode}`);
        }

        res.json({ 
            success: true, 
            friends: user.friends, 
            myCode: user.friendCode 
        });

    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: "Erreur serveur (Amis)." }); 
    }
});

// 6. AJOUTER UN AMI
app.post('/api/friends/add', async (req, res) => {
    try {
        const { username, password, friendCode } = req.body;

        const me = await User.findOne({ username });
        if (!me) return res.status(400).json({ error: "Auth incorrecte." });
        
        const isMatch = await bcrypt.compare(password, me.password);
        if (!isMatch) return res.status(400).json({ error: "Mot de passe incorrect." });

        const friend = await User.findOne({ friendCode: friendCode });
        if (!friend) return res.status(404).json({ error: "Code ami introuvable." });

        if (friend.username === me.username) return res.status(400).json({ error: "Tu ne peux pas t'ajouter toi-même !" });
        if (me.friends.includes(friend._id)) return res.status(400).json({ error: "Déjà ami." });

        // Ajout réciproque
        me.friends.push(friend._id);
        friend.friends.push(me._id);

        await me.save();
        await friend.save();

        res.json({ success: true, message: `Ami ${friend.username} ajouté !` });

    } catch (err) { res.status(500).json({ error: "Erreur serveur." }); }
});

// 7. SUPPRIMER UN AMI
app.post('/api/friends/remove', async (req, res) => {
    try {
        const { username, password, friendId } = req.body;
        
        const me = await User.findOne({ username });
        const isMatch = await bcrypt.compare(password, me.password);
        if (!isMatch) return res.status(400).json({ error: "Auth incorrecte." });

        const friend = await User.findById(friendId);

        // Retirer de ma liste
        me.friends = me.friends.filter(id => id.toString() !== friendId);
        await me.save();

        // Retirer de sa liste
        if(friend) {
            friend.friends = friend.friends.filter(id => id.toString() !== me._id.toString());
            await friend.save();
        }

        res.json({ success: true, message: "Ami supprimé." });
    } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// --- LANCEMENT ---
app.listen(PORT, () => console.log(`🚀 Serveur prêt sur le port ${PORT}`));
