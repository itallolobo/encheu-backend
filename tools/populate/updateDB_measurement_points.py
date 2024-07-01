from tkinter.messagebox import RETRY
import pymongo
from streets import *
from pymongo import MongoClient
import dns.resolver
dns.resolver.default_resolver=dns.resolver.Resolver(configure=False)
dns.resolver.default_resolver.nameservers=['8.8.8.8']
import random
from faker import Faker
#client = pymongo.MongoClient("localhost:27017")
client = MongoClient("mongodb+srv://itallo:lobolobo@cluster0.zyhjden.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
db = client.encheu 
db.measurement_points.drop()
fake = Faker(locale='pt_BR')
STREET_DATABASE = streets
#STREET_DATABASE = [fake.street_name() for i in range(100000)]



collection = db.measurement_points
predicitons = ["Nenhuma enchente está prevista para a sua casa nos próximos dias", "Uma possível enchente poderá atingir sua casa a partir do dia 03/08/22, inundando até 0,53 metros", "Mesmo fora do alcance do rio, uma enchente poderá atingir sua casa devido ao refluxo dos bueiros a partir do dia 01/08/22, inundando até 0,53 metros",
               "Uma enchente está acontecendo nessa rua {}".format(random.choice(["e seu nivel deve continuar subindo pelos proximos três dias, atingindo uma maxima de 1.32 m em relação ao nivel do solo", "e seu nivel permanecerá estavel durante os proximos dois dias, reduzindo a partir do dia 04/08/22"]))]

years = ["10/02/2010", "06/01/2011", "11/09/2012", "28/07/2013", "10/02/2014", "30/05/2015",
         "12/03/2016", "24/10/2017", "22/08/2018", "15/03/2019", "12/07/2020", "10/01/2021", "01/05/2022"]


def flood_history():
    single_history = ["A agua alcançou {} m em relação ao nivel do solo".format(
        round(random.randint(10, 300)/100), 2)]
    single_history.append(
        "Inundou {}% a menos do que outras ruas afetadas".format(random.randint(0, 100)))
    single_history.append("Ficou {} inundada".format(random.choice(
        ["um dia", "dois dias", "três dias", "quatro dias", "cinco dias", "seis dias", "uma semana", "mais de uma semana"])))
    return single_history


for i, street in enumerate(STREET_DATABASE):
    points = []

    for j in range(random.randint(1, 20)):
        history = []
        picked_years = random.sample(years, random.randint(0, len(years)))
        for year in picked_years:
            history.append({"year": year, "floods": flood_history()})
        points.append({"number": random.randint(1, 4000), "height": random.randint(
            100, 300), "prediction": random.choice(predicitons), "history": history})

    measurement = {"name": street, "points": points}
    collection.insert_one(measurement)
    print(len(STREET_DATABASE)-i)

collection.create_index([("name", pymongo.TEXT)], name='search_index')
# for i in collection.find():  # returns a list of documents in the collection
# print(i)  # print collection document
