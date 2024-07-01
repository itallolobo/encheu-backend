from pymongo import MongoClient
import dns.resolver
dns.resolver.default_resolver=dns.resolver.Resolver(configure=False)
dns.resolver.default_resolver.nameservers=['8.8.8.8']
#client = MongoClient("localhost:27017")
#client = MongoClient("mongodb+srv://encheu-master:YdXRLhCLwSaEwJsn@cluster0.vyckjxl.mongodb.net/?retryWrites=true&w=majority")
client = MongoClient("mongodb+srv://itallo:lobolobo@cluster0.zyhjden.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")

db = client.encheu  # you can also do 'client["example_database"]'
collection = db.level_data

level_data = {"date": "30/06/2024", "last_level": 2.12, "max_level": 2.32, "last_pressure": 158, "max_pressure": 198,
               "predictions": [{"29/06/2024": 2.22}, {"28/06/2024": 2.12}, {"27/06/2024": 2.02}]}
collection.insert_one(level_data)


for i in collection.find():  # returns a list of documents in the collection
    print(i)  # print collection document
