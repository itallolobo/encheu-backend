const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send(
    JSON.stringify({
      "isNormal": true,
      "isFloodQuota": false,
      "predText":
        "Nenhuma enchente está prevista para os proximos dias, o nível do rio deve prevalecer por volta de 2.5 m por toda a semana",
    })
  );
});

module.exports = router;
